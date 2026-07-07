-- ============================================================================
-- 029_payments_income_v1.sql
-- Ingresos y señas V1 — extensión de public.payments para cobros manuales.
--
-- CONTEXTO DE SEGURIDAD (importante para entender el diseño de RLS):
--
--   El backend de Mercado Pago (backend/src/routes/mercadoPagoPayments.js)
--   usa SUPABASE_SERVICE_ROLE_KEY — omite RLS completamente.
--   Es el único actor que hace INSERT/UPDATE directo en payments fuera de
--   esta RPC. Los usuarios authenticated (frontend Supabase) NUNCA tienen
--   policy INSERT ni UPDATE directa sobre payments después de esta migración.
--
--   Esto permite endurecer RLS sin romper el flujo de MP:
--     - INSERT en payments: solo service role (MP backend) o RPC create_manual_payment
--     - UPDATE en payments: solo service role (MP backend/webhook)
--     - DELETE en payments: nadie — pagos se cancelan, no se borran
--     - SELECT en payments: granular por rol (ver bloque 7)
--
-- Qué hace esta migración:
--   1. Agrega columnas: professional_id, kind, source, created_by
--   2. CHECK constraints en kind y source
--   3. Backfill conservador de source, kind, professional_id para filas MP
--   4. Índices para reportes y rendición
--   5. Trigger: normalización automática de source según provider (INSERT/UPDATE)
--   6. Trigger: validación de clinic_id en INSERT/UPDATE
--   7. Trigger: created_by inmutable — se fija en INSERT, bloqueado en UPDATE
--   8. RLS: elimina policy FOR ALL amplia, crea solo policies SELECT granulares
--      Sin policy INSERT ni UPDATE para authenticated — solo service role y RPC
--   9. RPC SECURITY DEFINER public.create_manual_payment(...)
--
-- NO toca:
--   payment_settings, payment_events, invoices, invoice_items,
--   fiscal_settings, appointments.status, clinical_evolutions,
--   frontend, backend Mercado Pago.
-- ============================================================================


-- ============================================================================
-- 1. COLUMNAS NUEVAS EN public.payments
-- ============================================================================

alter table public.payments
  add column if not exists professional_id uuid
    references public.professionals(id) on delete set null,
  add column if not exists kind   text not null default 'payment',
  add column if not exists source text not null default 'manual',
  add column if not exists created_by uuid
    references auth.users(id) on delete set null;

-- ============================================================================
-- 2. CHECK CONSTRAINTS
-- ============================================================================

alter table public.payments
  drop constraint if exists payments_kind_check;

alter table public.payments
  add constraint payments_kind_check
    check (kind in ('deposit', 'payment', 'copay', 'adjustment'));

alter table public.payments
  drop constraint if exists payments_source_check;

alter table public.payments
  add constraint payments_source_check
    check (source in ('manual', 'mercado_pago', 'import'));

-- status: NO agregamos CHECK — los webhooks de Mercado Pago pueden llegar con
-- valores como 'in_process', 'charged_back', 'authorized' que no están en el
-- enum del frontend y romperían el webhook si se restringen aquí.

-- ============================================================================
-- 3. ÍNDICES
-- ============================================================================

create index if not exists payments_professional_id_idx
  on public.payments (professional_id);

create index if not exists payments_kind_idx
  on public.payments (clinic_id, kind);

create index if not exists payments_source_idx
  on public.payments (clinic_id, source);

create index if not exists payments_created_by_idx
  on public.payments (created_by);

-- Índice compuesto para reportes de rendición profesional (clinic + prof + fecha)
create index if not exists payments_rendicion_idx
  on public.payments (clinic_id, professional_id, paid_at)
  where professional_id is not null;

-- ============================================================================
-- 4. BACKFILL
-- ============================================================================

-- 4a. source = 'mercado_pago' para registros existentes del proveedor MP
update public.payments
  set source = 'mercado_pago'
  where provider = 'mercado_pago'
    and source = 'manual';

-- 4b. professional_id desde appointments.professional_id cuando existe appointment
--     Criterio: solo si el payment tiene appointment_id y no tiene professional_id
update public.payments p
  set professional_id = a.professional_id
  from public.appointments a
  where p.appointment_id    = a.id
    and a.professional_id  is not null
    and p.professional_id  is null;

-- 4c. kind = 'deposit' para pagos MP que son señas.
--     Criterio conservador: proveedor MP, servicio con deposit_required=true,
--     monto del pago <= deposit_amount del servicio con tolerancia 10%.
--     Solo reclasifica los que tienen kind = 'payment' (el default).
update public.payments p
  set kind = 'deposit'
  from public.appointments a
  join public.services s on s.id = a.service_id
  where p.appointment_id = a.id
    and p.provider       = 'mercado_pago'
    and s.deposit_required = true
    and s.deposit_amount is not null
    and p.amount         <= (s.deposit_amount * 1.10)
    and p.kind           = 'payment';

-- ============================================================================
-- 5. TRIGGER: NORMALIZACIÓN AUTOMÁTICA DE source SEGÚN provider
--
-- El backend de MP no setea source en el INSERT — quedaría con el default
-- 'manual'. Este trigger corrige eso automáticamente en INSERT y UPDATE,
-- sin necesidad de cambiar el backend.
--
-- Reglas (en orden de precedencia):
--   1. Si NEW.provider = 'mercado_pago' → forzar source = 'mercado_pago'
--      (cubre tanto cobros nuevos como updates del webhook que completan provider)
--   2. Si NEW.source = 'import' → respetar, no modificar
--   3. Si NEW.source = 'mercado_pago' y provider ≠ 'mercado_pago' → respetar
--      (caso raro, pero válido si source fue seteado explícitamente)
--   4. Si NEW.provider IS NULL y NEW.source IS NULL → source = 'manual'
--      (registro sin proveedor ni fuente explícita = cobro manual)
--   5. Cualquier otro caso: no modificar source
--
-- Nombre trg_normalize... → corre antes de trg_validate... (orden alfabético).
-- ============================================================================

create or replace function public.normalize_payment_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Regla 1: provider = 'mercado_pago' siempre implica source = 'mercado_pago'
  if NEW.provider = 'mercado_pago' then
    NEW.source := 'mercado_pago';
    return NEW;
  end if;

  -- Regla 2 y 3: source explícito ('import' o 'mercado_pago') → respetar
  if NEW.source in ('import', 'mercado_pago') then
    return NEW;
  end if;

  -- Regla 4: sin provider y sin source explícito → 'manual'
  if NEW.provider is null and NEW.source is null then
    NEW.source := 'manual';
    return NEW;
  end if;

  -- Regla 5: dejar como está
  return NEW;
end;
$$;

drop trigger if exists trg_normalize_payment_source on public.payments;
create trigger trg_normalize_payment_source
  before insert or update on public.payments
  for each row
  execute function public.normalize_payment_source();

-- ============================================================================
-- 6. TRIGGER: VALIDACIÓN DE CLINIC_ID (trg_validate... corre después de trg_normalize...)
--
-- Valida que patient_id, appointment_id, professional_id, service_id,
-- invoice_id pertenecen al mismo clinic_id del payment.
-- También bloquea cambiar clinic_id en UPDATE.
-- Se ejecuta BEFORE INSERT OR UPDATE — cubre service role, RPC y cualquier
-- ruta futura de escritura.
-- ============================================================================

create or replace function public.validate_payment_clinic_consistency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.patient_id is not null then
    if not exists (
      select 1 from public.patients
      where id = NEW.patient_id and clinic_id = NEW.clinic_id
    ) then
      raise exception 'PAYMENT_CLINIC_MISMATCH: patient_id does not belong to clinic_id'
        using errcode = 'P0010';
    end if;
  end if;

  if NEW.appointment_id is not null then
    if not exists (
      select 1 from public.appointments
      where id = NEW.appointment_id and clinic_id = NEW.clinic_id
    ) then
      raise exception 'PAYMENT_CLINIC_MISMATCH: appointment_id does not belong to clinic_id'
        using errcode = 'P0010';
    end if;
  end if;

  if NEW.professional_id is not null then
    if not exists (
      select 1 from public.professionals
      where id = NEW.professional_id and clinic_id = NEW.clinic_id
    ) then
      raise exception 'PAYMENT_CLINIC_MISMATCH: professional_id does not belong to clinic_id'
        using errcode = 'P0010';
    end if;
  end if;

  if NEW.service_id is not null then
    if not exists (
      select 1 from public.services
      where id = NEW.service_id and clinic_id = NEW.clinic_id
    ) then
      raise exception 'PAYMENT_CLINIC_MISMATCH: service_id does not belong to clinic_id'
        using errcode = 'P0010';
    end if;
  end if;

  if NEW.invoice_id is not null then
    if not exists (
      select 1 from public.invoices
      where id = NEW.invoice_id and clinic_id = NEW.clinic_id
    ) then
      raise exception 'PAYMENT_CLINIC_MISMATCH: invoice_id does not belong to clinic_id'
        using errcode = 'P0010';
    end if;
  end if;

  if TG_OP = 'UPDATE' and NEW.clinic_id <> OLD.clinic_id then
    raise exception 'PAYMENT_IMMUTABLE_CLINIC: clinic_id cannot be changed after creation'
      using errcode = 'P0011';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validate_payment_clinic on public.payments;
create trigger trg_validate_payment_clinic
  before insert or update on public.payments
  for each row
  execute function public.validate_payment_clinic_consistency();

-- ============================================================================
-- 7. TRIGGER: CREATED_BY INMUTABLE
--
-- En INSERT: sobreescribe created_by con auth.uid() siempre.
--   Previene que cualquier caller fuerce un created_by ajeno, incluyendo
--   la propia RPC que ya lo setea explícitamente (defensa en profundidad).
--   Si auth.uid() es null (service role sin JWT), created_by queda null
--   — los cobros de MP no tienen usuario humano asociado, eso es correcto.
--
-- En UPDATE: bloquea cualquier intento de cambiar created_by.
--   El autor del cobro es inmutable una vez registrado.
-- ============================================================================

create or replace function public.enforce_payment_created_by()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    -- Fijar con el usuario autenticado; null si viene de service role (MP)
    NEW.created_by := auth.uid();
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.created_by is distinct from OLD.created_by then
      raise exception 'PAYMENT_CREATED_BY_IMMUTABLE: created_by cannot be changed after creation'
        using errcode = 'P0012';
    end if;
    return NEW;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_payment_created_by on public.payments;
create trigger trg_enforce_payment_created_by
  before insert or update on public.payments
  for each row
  execute function public.enforce_payment_created_by();

-- ============================================================================
-- 8. RLS — SOLO POLICIES SELECT
--
-- El backend de MP usa service role → bypasea RLS → puede INSERT/UPDATE/DELETE.
-- Los usuarios authenticated NO tienen policy INSERT, UPDATE ni DELETE.
-- El único camino para INSERT manual es la RPC create_manual_payment
-- (SECURITY DEFINER), que inserta con los permisos del definer, no del caller.
--
-- Policies que se eliminan:
--   "clinic scoped staff manage payments" (FOR ALL, migración 021)
--   "admins can manage payments" (FOR ALL, migración 007 - por si existe)
--
-- Policies que se crean: solo SELECT, tres granulares.
-- Sin policy INSERT, UPDATE ni DELETE para authenticated.
-- ============================================================================

drop policy if exists "clinic scoped staff manage payments" on public.payments;
drop policy if exists "admins can manage payments"          on public.payments;
-- Limpiar cualquier otra policy vieja por nombre
drop policy if exists "billing staff can select payments"      on public.payments;
drop policy if exists "billing staff can insert payments"      on public.payments;
drop policy if exists "billing staff can update payments"      on public.payments;
drop policy if exists "professional can select own payments"   on public.payments;
drop policy if exists "platform admin can select payments"     on public.payments;

-- SELECT: admin / clinic_admin / receptionist ven todos los pagos de su clínica
create policy "billing staff can select payments"
  on public.payments
  for select
  using (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = payments.clinic_id
        and cm.role::text in ('clinic_admin', 'admin', 'receptionist')
    )
  );

-- SELECT: professional / doctor ven solo pagos donde professional_id = el suyo
create policy "professional can select own payments"
  on public.payments
  for select
  using (
    payments.professional_id is not null
    and exists (
      select 1
      from public.clinic_members cm
      join public.professionals  p on p.id = cm.professional_id
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = payments.clinic_id
        and cm.role::text in ('professional', 'doctor')
        and p.id          = payments.professional_id
    )
  );

-- SELECT: platform_admin puede leer pagos de cualquier clínica (solo lectura)
create policy "platform admin can select payments"
  on public.payments
  for select
  using (public.is_platform_admin());

-- ============================================================================
-- 9. RPC: public.create_manual_payment
--
-- Único punto de entrada para cobros manuales desde el frontend.
-- SECURITY DEFINER → inserta con permisos del definer, bypasseando la
-- ausencia de policy INSERT para authenticated.
--
-- Validaciones internas (no delega en trigger para dar mensajes precisos):
--   - sesión autenticada
--   - rol billing staff de la clínica (clinic_admin / admin / receptionist)
--   - amount > 0
--   - kind permitido
--   - status solo 'approved' o 'pending'
--   - method permitido
--   - consistencia clinic_id para patient / appointment / professional / service
--   - fija source = 'manual', provider = null, created_by = auth.uid()
--   - fija paid_at = now() si status = 'approved'
--   - NO toca appointments.status
--   - actualiza appointments.payment_status si hay appointment_id
--   - devuelve jsonb con el payment creado + appointment_payment_status
-- ============================================================================

create or replace function public.create_manual_payment(
  p_clinic_id       uuid,
  p_patient_id      uuid,
  p_appointment_id  uuid    default null,
  p_professional_id uuid    default null,
  p_service_id      uuid    default null,
  p_amount          numeric default null,
  p_currency        text    default 'ARS',
  p_method          text    default 'cash',
  p_kind            text    default 'payment',
  p_status          text    default 'approved',
  p_notes           text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid             uuid := auth.uid();
  v_payment_id      uuid;
  v_paid_at         timestamptz;
  v_apmt_status     text;
  v_result          jsonb;
  v_appt            record;            -- fila del appointment si se provee
  v_patient_id      uuid;              -- resuelto: p_patient_id o appointment.patient_id
  v_professional_id uuid;              -- resuelto: p_professional_id o appointment.professional_id
  v_service_id      uuid;              -- resuelto: p_service_id o appointment.service_id
begin
  -- 1. Sesión autenticada
  if v_uid is null then
    raise exception 'UNAUTHORIZED'
      using errcode = 'P0001';
  end if;

  -- 2. Rol: solo billing staff de la clínica
  if not exists (
    select 1 from public.clinic_members cm
    where cm.user_id   = v_uid
      and cm.active    = true
      and cm.clinic_id = p_clinic_id
      and cm.role::text in ('clinic_admin', 'admin', 'receptionist')
  ) then
    raise exception 'FORBIDDEN: only clinic_admin, admin or receptionist can create manual payments'
      using errcode = 'P0001';
  end if;

  -- 3. amount > 0
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: amount must be greater than 0'
      using errcode = 'P0020';
  end if;

  -- 4. kind permitido
  if p_kind not in ('deposit', 'payment', 'copay', 'adjustment') then
    raise exception 'INVALID_KIND: must be deposit, payment, copay, or adjustment'
      using errcode = 'P0021';
  end if;

  -- 5. status solo 'approved' o 'pending' para cobros manuales
  if p_status not in ('approved', 'pending') then
    raise exception 'INVALID_STATUS: manual payments accept approved or pending only'
      using errcode = 'P0022';
  end if;

  -- 6. method permitido
  if p_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'INVALID_METHOD: must be cash, transfer, card, or other'
      using errcode = 'P0023';
  end if;

  -- 7. Inicializar valores resueltos desde los parámetros
  v_patient_id      := p_patient_id;
  v_professional_id := p_professional_id;
  v_service_id      := p_service_id;

  -- 8. Si hay appointment_id: cargar con FOR UPDATE, validar consistencia y
  --    propagar campos del turno a los valores resueltos.
  --    FOR UPDATE serializa creaciones concurrentes sobre el mismo turno.
  if p_appointment_id is not null then

    select clinic_id, patient_id, professional_id, service_id
      into v_appt
      from public.appointments
      where id = p_appointment_id
      for update;

    if not found then
      raise exception 'PAYMENT_APPOINTMENT_MISMATCH: appointment not found'
        using errcode = 'P0030';
    end if;

    -- El appointment debe pertenecer a la clínica indicada
    if v_appt.clinic_id <> p_clinic_id then
      raise exception 'PAYMENT_CLINIC_MISMATCH: appointment_id does not belong to clinic_id'
        using errcode = 'P0010';
    end if;

    -- patient_id explícito debe coincidir con el del turno
    if p_patient_id is not null and p_patient_id <> v_appt.patient_id then
      raise exception 'PAYMENT_APPOINTMENT_MISMATCH: patient_id does not match appointment.patient_id'
        using errcode = 'P0030';
    end if;

    -- professional_id explícito debe coincidir con el del turno (si el turno lo tiene)
    -- El turno manda: si el caller pasa professional_id, debe coincidir exactamente
    -- con el del turno (incluso si el turno tiene null — IS DISTINCT FROM cubre eso)
    if p_professional_id is not null
       and p_professional_id is distinct from v_appt.professional_id then
      raise exception 'PAYMENT_APPOINTMENT_MISMATCH: professional_id does not match appointment.professional_id'
        using errcode = 'P0030';
    end if;

    -- Ídem para service_id
    if p_service_id is not null
       and p_service_id is distinct from v_appt.service_id then
      raise exception 'PAYMENT_APPOINTMENT_MISMATCH: service_id does not match appointment.service_id'
        using errcode = 'P0030';
    end if;

    -- Propagar desde el turno si no se pasaron explícitamente
    if v_patient_id is null then
      v_patient_id := v_appt.patient_id;
    end if;

    if v_professional_id is null and v_appt.professional_id is not null then
      v_professional_id := v_appt.professional_id;
    end if;

    if v_service_id is null and v_appt.service_id is not null then
      v_service_id := v_appt.service_id;
    end if;

  else
    -- Sin appointment: validar individualmente que pertenecen a la clínica

    if v_patient_id is not null then
      if not exists (
        select 1 from public.patients
        where id = v_patient_id and clinic_id = p_clinic_id
      ) then
        raise exception 'PAYMENT_CLINIC_MISMATCH: patient_id does not belong to clinic_id'
          using errcode = 'P0010';
      end if;
    end if;

    if v_professional_id is not null then
      if not exists (
        select 1 from public.professionals
        where id = v_professional_id and clinic_id = p_clinic_id
      ) then
        raise exception 'PAYMENT_CLINIC_MISMATCH: professional_id does not belong to clinic_id'
          using errcode = 'P0010';
      end if;
    end if;

    if v_service_id is not null then
      if not exists (
        select 1 from public.services
        where id = v_service_id and clinic_id = p_clinic_id
      ) then
        raise exception 'PAYMENT_CLINIC_MISMATCH: service_id does not belong to clinic_id'
          using errcode = 'P0010';
      end if;
    end if;

  end if;

  -- 9. Paciente obligatorio (puede haber sido propagado desde el appointment en el bloque anterior)
  if v_patient_id is null then
    raise exception 'INVALID_PATIENT: patient_id is required'
      using errcode = 'P0024';
  end if;

  -- 10. paid_at según status
  v_paid_at := case when p_status = 'approved' then now() else null end;

  -- 11. INSERT usando valores resueltos (v_ pueden diferir de p_ si se
  --     propagaron desde el appointment en el bloque anterior).
  --     source siempre 'manual', provider siempre null, created_by = v_uid.
  insert into public.payments (
    clinic_id,
    patient_id,
    appointment_id,
    professional_id,
    service_id,
    amount,
    currency,
    method,
    kind,
    source,
    provider,
    status,
    paid_at,
    notes,
    created_by,
    created_at,
    updated_at
  ) values (
    p_clinic_id,
    v_patient_id,        -- resuelto: p_patient_id o appointment.patient_id
    p_appointment_id,
    v_professional_id,   -- resuelto: p_professional_id o appointment.professional_id
    v_service_id,        -- resuelto: p_service_id o appointment.service_id
    p_amount,
    p_currency,
    p_method,
    p_kind,
    'manual',            -- source siempre 'manual'
    null,                -- provider null (no es MP)
    p_status,
    v_paid_at,
    p_notes,
    v_uid,               -- created_by; trigger también lo fuerza
    now(),
    now()
  )
  returning id into v_payment_id;

  -- 12. Actualizar appointments.payment_status si hay turno
  --     NO toca appointments.status bajo ninguna circunstancia.
  if p_appointment_id is not null then
    v_apmt_status := case
      when p_status = 'approved' then
        case p_kind
          when 'deposit'    then 'deposit_paid'
          when 'payment'    then 'paid'
          when 'copay'      then 'paid'       -- copay_paid no existe en el enum
          when 'adjustment' then 'paid'
          else                   'paid'
        end
      else  -- p_status = 'pending'
        case p_kind
          when 'deposit' then 'deposit_pending'
          else                'unpaid'
        end
    end;

    update public.appointments
      set payment_status = v_apmt_status,
          updated_at     = now()
      where id = p_appointment_id;
      -- NO se toca: appointments.status
  end if;

  -- 13. Resultado
  select jsonb_build_object(
    'id',                        p.id,
    'clinic_id',                 p.clinic_id,
    'patient_id',                p.patient_id,
    'appointment_id',            p.appointment_id,
    'professional_id',           p.professional_id,
    'service_id',                p.service_id,
    'amount',                    p.amount,
    'currency',                  p.currency,
    'method',                    p.method,
    'kind',                      p.kind,
    'source',                    p.source,
    'status',                    p.status,
    'paid_at',                   p.paid_at,
    'notes',                     p.notes,
    'created_by',                p.created_by,
    'created_at',                p.created_at,
    'appointment_payment_status', v_apmt_status
  )
  into v_result
  from public.payments p
  where p.id = v_payment_id;

  return v_result;
end;
$$;

-- Revocar acceso público y otorgar solo a authenticated
revoke all on function public.create_manual_payment(
  uuid, uuid, uuid, uuid, uuid, numeric, text, text, text, text, text
) from public;

grant execute on function public.create_manual_payment(
  uuid, uuid, uuid, uuid, uuid, numeric, text, text, text, text, text
) to authenticated;

-- ============================================================================
-- 10. QUERIES DE VERIFICACIÓN (solo lectura — copiar al SQL Editor post-apply)
-- ============================================================================

-- A. Columnas nuevas (esperado: 4 filas)
/*
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'payments'
  and column_name  in ('professional_id', 'kind', 'source', 'created_by')
order by column_name;
*/

-- B. CHECK constraints (esperado: 2 filas con los valores del enum)
/*
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid  = 'public.payments'::regclass
  and contype   = 'c'
  and conname  in ('payments_kind_check', 'payments_source_check');
*/

-- C. Índices nuevos (esperado: 5 filas)
/*
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename  = 'payments'
  and indexname  in (
    'payments_professional_id_idx',
    'payments_kind_idx',
    'payments_source_idx',
    'payments_created_by_idx',
    'payments_rendicion_idx'
  )
order by indexname;
*/

-- D. Triggers activos en payments
--    Esperado: 5 filas:
--      trg_enforce_payment_created_by  INSERT
--      trg_enforce_payment_created_by  UPDATE
--      trg_normalize_payment_source    INSERT
--      trg_normalize_payment_source    UPDATE
--      trg_validate_payment_clinic     INSERT
--      trg_validate_payment_clinic     UPDATE
--    Total: 6 filas
/*
select trigger_name, event_manipulation, action_timing
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table  = 'payments'
  and trigger_name in (
    'trg_normalize_payment_source',
    'trg_validate_payment_clinic',
    'trg_enforce_payment_created_by'
  )
order by trigger_name, event_manipulation;
*/

-- E. Orden de ejecución de triggers (alphabetical = ejecución correcta)
/*
select trigger_name, event_manipulation,
       position_in_group  -- disponible en algunos Postgres; alternativa: confiar en orden alfabético
from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table  = 'payments'
order by trigger_name;
-- Orden esperado de ejecución para INSERT:
--   1. trg_enforce_payment_created_by  (fija created_by)
--   2. trg_normalize_payment_source    (normaliza source según provider)
--   3. trg_validate_payment_clinic     (valida consistencia clinic_id)
*/

-- F. RPC: existe y es SECURITY DEFINER con grant a authenticated
/*
select routine_name, security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name   = 'create_manual_payment';
-- Esperado: 1 fila, security_type = 'DEFINER'

select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name   = 'create_manual_payment'
  and grantee        = 'authenticated';
-- Esperado: 1 fila, EXECUTE
*/

-- G. Policies actuales de payments — SOLO SELECT, exactamente 3
/*
select policyname, cmd, permissive
from pg_policies
where schemaname = 'public'
  and tablename  = 'payments'
order by cmd, policyname;
-- Esperado exactamente estas 3, todas con cmd = 'SELECT':
--   billing staff can select payments
--   platform admin can select payments
--   professional can select own payments
*/

-- H. Ausencia total de policies INSERT / UPDATE / DELETE (esperado: 0)
/*
select count(*) as non_select_policies_must_be_zero
from pg_policies
where schemaname = 'public'
  and tablename  = 'payments'
  and cmd        in ('INSERT', 'UPDATE', 'DELETE');
*/

-- I. Backfill source — ningún pago de MP debe tener source <> 'mercado_pago'
/*
select count(*) as mp_with_wrong_source_must_be_zero
from public.payments
where provider = 'mercado_pago'
  and source  <> 'mercado_pago';
*/

-- J. Distribución de source post-backfill
/*
select source, count(*) as total
from public.payments
group by source
order by source;
-- Solo 'manual' y 'mercado_pago'; ningún otro valor
*/

-- K. Distribución de kind post-backfill
/*
select kind, count(*) as total
from public.payments
group by kind
order by kind;
*/

-- L. Backfill professional_id desde appointments
/*
select
  count(*) filter (where p.professional_id is not null) as with_professional,
  count(*) filter (where p.professional_id is null)     as without_professional
from public.payments p
where p.appointment_id is not null;
*/

-- M. appointments.status NO tocado (comparar con estado previo a la migración)
/*
select status, count(*) as total
from public.appointments
group by status
order by status;
*/

-- N. appointments.payment_status NO tocado por esta migración
--    (solo la RPC lo modifica, no los backfills de columnas)
/*
select payment_status, count(*) as total
from public.appointments
group by payment_status
order by payment_status;
*/

-- O. Tablas no tocadas (todos los counts deben coincidir con pre-migración)
/*
select 'invoices'        as tabla, count(*) from public.invoices
union all
select 'invoice_items',           count(*) from public.invoice_items
union all
select 'fiscal_settings',         count(*) from public.fiscal_settings
union all
select 'payment_settings',        count(*) from public.payment_settings
union all
select 'payment_events',          count(*) from public.payment_events;
*/

-- P. Smoke test del trigger de normalización (sin mutar datos reales):
--    Confirmar que la función normalize_payment_source existe
/*
select routine_name, routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name   = 'normalize_payment_source';
-- Esperado: 1 fila
*/

-- Q. Confirmar que no quedan pagos MP sin source correcto post-trigger
--    (esta query debería devolver 0 si el backfill y el trigger están activos)
/*
select count(*) as orphan_mp_payments_must_be_zero
from public.payments
where provider = 'mercado_pago'
  and (source is null or source <> 'mercado_pago');
*/

-- R. Consistencia appointment: pagos con appointment_id cuyo patient/professional/service
--    difieren del turno usando IS DISTINCT FROM (detecta null vs valor también).
--    Debe devolver 0 filas para pagos creados por la RPC.
--    Filas preexistentes de MP pueden aparecer si el turno fue editado tras el pago.
/*
select
  p.id,
  p.appointment_id,
  p.patient_id,                    a.patient_id      as appointment_patient_id,
  p.professional_id,               a.professional_id as appointment_professional_id,
  p.service_id,                    a.service_id      as appointment_service_id
from public.payments p
join public.appointments a on a.id = p.appointment_id
where p.patient_id      is distinct from a.patient_id
   or p.professional_id is distinct from a.professional_id
   or p.service_id      is distinct from a.service_id;
*/

-- S. Confirmar que no existen policies INSERT / UPDATE / DELETE para authenticated
--    (debe devolver 0 — idéntico a H pero con el foco en el rol)
/*
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename  = 'payments'
  and cmd       <> 'SELECT';
-- Esperado: 0 filas
*/

-- T. Confirmar source correcto para pagos MP — doble check de I y Q juntos
/*
select
  provider,
  source,
  count(*) as total
from public.payments
where provider = 'mercado_pago'
group by provider, source;
-- Esperado: solo 1 fila con provider='mercado_pago', source='mercado_pago'
-- Si aparece source='manual' u otro valor: el backfill o el trigger fallaron
*/
