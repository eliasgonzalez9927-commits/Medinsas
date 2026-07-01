-- ============================================================================
-- 027_clinical_evolutions.sql
-- Módulo Registro Clínico V1 — "Ficha clínica digital"
--
-- Crea la tabla clinical_evolutions para evoluciones por consulta.
-- NO es HCE legal. No incluye firma digital. No expone datos al paciente.
--
-- Roles válidos en public.user_role:
--   patient | admin | platform_admin | clinic_admin | receptionist
--   professional | doctor
--
-- Nota 'doctor': alias legacy de 'professional'. Activo en frontend
-- (PROFESSIONAL_ROLES en auth-roles.ts) y backend (roles.js). Incluido en
-- todas las políticas RLS junto a 'professional'. Consolidar en V2.
--
-- Funciones RLS disponibles (security definer ya existentes):
--   public.is_platform_admin()
--   public.can_access_clinic(p_clinic_id)
--   public.can_manage_clinic_settings(p_clinic_id)
--
-- Schema de appointments confirmado (columnas relevantes):
--   appointments.clinic_id      uuid  (agregado en 003)
--   appointments.patient_id     uuid  (FK a patients, migración 005)
--   appointments.professional_id uuid (agregado en 003)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla principal
-- ----------------------------------------------------------------------------
create table if not exists public.clinical_evolutions (
  id              uuid primary key default gen_random_uuid(),

  -- Scope multi-tenant obligatorio
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete restrict,
  appointment_id  uuid          references public.appointments(id) on delete set null,
  professional_id uuid          references public.professionals(id) on delete set null,

  -- Contenido clínico V1 (texto libre; sin fulltext todavía)
  reason            text,  -- motivo de consulta
  current_condition text,  -- enfermedad actual / anamnesis
  physical_exam     text,  -- examen físico
  diagnosis         text,  -- diagnóstico
  plan              text,  -- plan de tratamiento
  observations      text,  -- observaciones internas

  -- Estado del registro
  status text not null default 'draft',
  constraint clinical_evolutions_status_check
    check (status in ('draft', 'closed')),

  -- Cierre: poblado solo cuando status = 'closed'
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,

  -- Consistencia de cierre:
  --   closed → closed_at y closed_by no null
  --   draft  → closed_at y closed_by null
  constraint clinical_evolutions_closed_consistency check (
    (status = 'closed' and closed_at is not null and closed_by is not null)
    or
    (status = 'draft' and closed_at is null and closed_by is null)
  ),

  -- Trazabilidad (el trigger rellena nulls con auth.uid())
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- ----------------------------------------------------------------------------
-- 2. Índices
-- ----------------------------------------------------------------------------
create index if not exists clinical_evolutions_clinic_patient_created_idx
  on public.clinical_evolutions (clinic_id, patient_id, created_at desc);

create index if not exists clinical_evolutions_clinic_appointment_idx
  on public.clinical_evolutions (clinic_id, appointment_id);

create index if not exists clinical_evolutions_clinic_professional_created_idx
  on public.clinical_evolutions (clinic_id, professional_id, created_at desc);

create index if not exists clinical_evolutions_clinic_status_idx
  on public.clinical_evolutions (clinic_id, status);

create index if not exists clinical_evolutions_created_by_idx
  on public.clinical_evolutions (created_by);

create index if not exists clinical_evolutions_updated_by_idx
  on public.clinical_evolutions (updated_by);

-- ----------------------------------------------------------------------------
-- 3. Función de integridad multi-clínica
--
-- Valida que todos los IDs relacionados pertenecen a la misma clínica
-- y que el turno corresponde al mismo paciente (y opcionalmente al mismo
-- profesional) que la evolución.
--
-- Decisión sobre SECURITY:
--   Esta función lee patients, appointments y professionals para validar
--   integridad estructural, no para exponer datos. Los usuarios que llegan
--   aquí ya pasaron la política USING (son miembros activos de la clínica).
--   Podría ser INVOKER si esas tablas tienen RLS permisiva para miembros,
--   pero para no depender de que el RLS de cada tabla incluya al miembro
--   que está insertando/actualizando, se deja SECURITY DEFINER con
--   search_path restringido — principio de mínima sorpresa.
-- ----------------------------------------------------------------------------
create or replace function public.clinical_evolution_cross_clinic_ok(
  p_clinic_id       uuid,
  p_patient_id      uuid,
  p_appointment_id  uuid,
  p_professional_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select
    -- 1. patient_id pertenece a la clínica
    exists (
      select 1 from public.patients
      where id = p_patient_id
        and clinic_id = p_clinic_id
    )

    -- 2. appointment_id (opcional): misma clínica Y mismo paciente.
    --    También valida professional_id si ambos están presentes,
    --    porque appointments.professional_id puede ser null (turno sin profesional asignado).
    and (
      p_appointment_id is null
      or exists (
        select 1 from public.appointments
        where id            = p_appointment_id
          and clinic_id     = p_clinic_id
          and patient_id    = p_patient_id
          and (
            p_professional_id is null
            or professional_id is null
            or professional_id = p_professional_id
          )
      )
    )

    -- 3. professional_id (opcional): pertenece a la clínica
    and (
      p_professional_id is null
      or exists (
        select 1 from public.professionals
        where id        = p_professional_id
          and clinic_id = p_clinic_id
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- 4. Trigger de trazabilidad automática
--
-- Decisión sobre SECURITY:
--   Necesita llamar auth.uid() en contexto before-trigger. En Supabase,
--   auth.uid() funciona con SECURITY INVOKER siempre que la sesión tenga JWT.
--   Cuando el service role bypasa RLS, auth.uid() devuelve null — el trigger
--   usa coalesce() para no romper en ese caso.
--   Se deja SECURITY INVOKER (default) para no elevar permisos innecesariamente.
--   search_path explícito igual para consistencia.
--
-- EN INSERT:
--   - updated_at  = now() siempre
--   - created_at  = coalesce(valor enviado, now())
--   - created_by  = coalesce(valor enviado, auth.uid())
--   - updated_by  = coalesce(valor enviado, auth.uid())
--   - si status = 'closed': auto-poblar closed_at y closed_by si son null
--     (permite crear y cerrar en una sola operación)
--   - si status = 'draft': closed_at y closed_by deben ser null
--     (el constraint los validará; el trigger no los toca)
--
-- EN UPDATE:
--   - updated_at = now() siempre
--   - updated_by = coalesce(auth.uid(), valor existente)
--   - si status pasa de 'draft' a 'closed':
--       closed_at = coalesce(nuevo valor, now())
--       closed_by = coalesce(nuevo valor, auth.uid())
--   - si status intenta pasar de 'closed' a 'draft': RAISE EXCEPTION
--     (doble barrera junto al USING de las políticas UPDATE)
-- ----------------------------------------------------------------------------
create or replace function public.clinical_evolutions_auto_trace()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at  := now();
    new.created_at  := coalesce(new.created_at, now());
    new.created_by  := coalesce(new.created_by, auth.uid());
    new.updated_by  := coalesce(new.updated_by, auth.uid());

    -- Soporte para INSERT directo como closed (crear y cerrar en una acción)
    if new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
      new.closed_by := coalesce(new.closed_by, auth.uid());
    end if;

    -- Si status = 'draft', closed_at/closed_by deben ser null.
    -- No los tocamos; el constraint clinical_evolutions_closed_consistency
    -- los validará y rechazará si el cliente envió valores incorrectos.

  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);

    if old.status = 'draft' and new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
      new.closed_by := coalesce(new.closed_by, auth.uid());
    end if;

    -- Impedir reapertura de registro cerrado (doble barrera con USING)
    if old.status = 'closed' and new.status = 'draft' then
      raise exception
        'clinical_evolutions: registro cerrado no puede reabrirse (id: %)', old.id
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists clinical_evolutions_auto_trace_trigger
  on public.clinical_evolutions;

create trigger clinical_evolutions_auto_trace_trigger
  before insert or update on public.clinical_evolutions
  for each row execute function public.clinical_evolutions_auto_trace();

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------
alter table public.clinical_evolutions enable row level security;

-- ---- SELECT -----------------------------------------------------------------
-- platform_admin : acceso total
-- clinic_admin / admin : todas las evoluciones de su clínica
-- professional / doctor: todas las evoluciones de su clínica (miembro activo)
-- receptionist : sin acceso SELECT
-- patient      : sin acceso directo

drop policy if exists "clinical evolutions select platform admin" on public.clinical_evolutions;
create policy "clinical evolutions select platform admin"
  on public.clinical_evolutions
  for select
  using (public.is_platform_admin());

drop policy if exists "clinical evolutions select clinic managers" on public.clinical_evolutions;
create policy "clinical evolutions select clinic managers"
  on public.clinical_evolutions
  for select
  using (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = clinical_evolutions.clinic_id
        and cm.role::text in ('clinic_admin', 'admin')
    )
  );

drop policy if exists "clinical evolutions select professional" on public.clinical_evolutions;
create policy "clinical evolutions select professional"
  on public.clinical_evolutions
  for select
  using (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = clinical_evolutions.clinic_id
        and cm.role::text in ('professional', 'doctor')
    )
  );

-- ---- INSERT -----------------------------------------------------------------
-- WITH CHECK valida:
--   a) usuario es miembro activo con rol autorizado de esa clínica
--   b) integridad multi-clínica de todos los IDs relacionados
--      (incluyendo que appointment pertenece al mismo patient)

drop policy if exists "clinical evolutions insert clinic staff" on public.clinical_evolutions;
create policy "clinical evolutions insert clinic staff"
  on public.clinical_evolutions
  for insert
  with check (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = clinical_evolutions.clinic_id
        and cm.role::text in ('clinic_admin', 'admin', 'professional', 'doctor')
    )
    and public.clinical_evolution_cross_clinic_ok(
      clinical_evolutions.clinic_id,
      clinical_evolutions.patient_id,
      clinical_evolutions.appointment_id,
      clinical_evolutions.professional_id
    )
  );

-- ---- UPDATE -----------------------------------------------------------------
-- USING  (fila actual, pre-cambio):
--   - status actual debe ser 'draft'  → bloquea edición de registros cerrados
--   - usuario miembro activo con rol autorizado
--
-- WITH CHECK (fila nueva, post-cambio):
--   - nuevo status in ('draft','closed')  → permite editar y también cerrar
--   - usuario sigue siendo miembro activo con rol autorizado
--   - integridad multi-clínica
--
-- Flujos posibles:
--   draft  → draft  : USING OK (old='draft'), WITH CHECK OK (new='draft')
--   draft  → closed : USING OK (old='draft'), WITH CHECK OK (new='closed')
--                     trigger auto-popula closed_at / closed_by antes del constraint
--   closed → *      : USING FALLA (old='closed') → rechazado antes de llegar al trigger
--   closed → draft  : USING FALLA primero; trigger lanza RAISE EXCEPTION como segunda barrera

drop policy if exists "clinical evolutions update clinic managers" on public.clinical_evolutions;
create policy "clinical evolutions update clinic managers"
  on public.clinical_evolutions
  for update
  using (
    status = 'draft'
    and exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = clinical_evolutions.clinic_id
        and cm.role::text in ('clinic_admin', 'admin')
    )
  )
  with check (
    -- En WITH CHECK, las referencias a columnas son los valores nuevos (sin prefijo NEW)
    status in ('draft', 'closed')
    and exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = clinical_evolutions.clinic_id
        and cm.role::text in ('clinic_admin', 'admin')
    )
    and public.clinical_evolution_cross_clinic_ok(
      clinical_evolutions.clinic_id,
      clinical_evolutions.patient_id,
      clinical_evolutions.appointment_id,
      clinical_evolutions.professional_id
    )
  );

drop policy if exists "clinical evolutions update professional" on public.clinical_evolutions;
create policy "clinical evolutions update professional"
  on public.clinical_evolutions
  for update
  using (
    status = 'draft'
    and exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = clinical_evolutions.clinic_id
        and cm.role::text in ('professional', 'doctor')
    )
  )
  with check (
    -- En WITH CHECK, las referencias a columnas son los valores nuevos (sin prefijo NEW)
    status in ('draft', 'closed')
    and exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = auth.uid()
        and cm.active    = true
        and cm.clinic_id = clinical_evolutions.clinic_id
        and cm.role::text in ('professional', 'doctor')
    )
    and public.clinical_evolution_cross_clinic_ok(
      clinical_evolutions.clinic_id,
      clinical_evolutions.patient_id,
      clinical_evolutions.appointment_id,
      clinical_evolutions.professional_id
    )
  );

-- ---- DELETE -----------------------------------------------------------------
-- Sin política DELETE para usuarios normales.
-- Solo service role (que bypasa RLS) puede eliminar operativamente.
