-- ============================================================================
-- 028_appointment_attention_timestamps.sql
-- Soporte para registrar inicio y fin real de atención médica.
-- Agrega 4 columnas nullable a appointments + 2 índices + 2 RPCs SECURITY DEFINER.
-- NO modifica constraints existentes. NO toca appointments.status.
-- NO toca clinical_evolutions. NO toca RLS existente.
--
-- Permisos en los RPCs:
--   - platform_admin (via profiles.role o clinic_members.role)
--   - clinic_admin/admin activo de esa clínica
--   - professional/doctor activo de esa clínica SOLO si clinic_members.professional_id
--     coincide con appointments.professional_id
--   Rechaza: receptionist, professional/doctor sin vínculo al turno, sin membership activo.
--
-- Race condition: SELECT ... FOR UPDATE sobre el appointment antes de validar
--   attention_started_at / attention_finished_at, para serializar accesos concurrentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas
-- ----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists attention_started_at  timestamptz,
  add column if not exists attention_started_by  uuid references auth.users(id) on delete set null,
  add column if not exists attention_finished_at timestamptz,
  add column if not exists attention_finished_by uuid references auth.users(id) on delete set null;

-- ----------------------------------------------------------------------------
-- 2. Índices
-- ----------------------------------------------------------------------------
create index if not exists appointments_attention_started_at_idx
  on public.appointments (clinic_id, attention_started_at)
  where attention_started_at is not null;

create index if not exists appointments_attention_open_idx
  on public.appointments (clinic_id, attention_started_at)
  where attention_started_at is not null and attention_finished_at is null;

-- ----------------------------------------------------------------------------
-- 3. RPC start_attention
-- ----------------------------------------------------------------------------
create or replace function public.start_attention(
  p_appointment_id uuid,
  p_clinic_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_appt   record;
  v_result jsonb;
begin
  -- 1. Sesión autenticada
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  -- 2. Bloqueo de fila para serializar accesos concurrentes (evita doble inicio)
  select id, clinic_id, professional_id, attention_started_at, attention_finished_at
  into v_appt
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_appt.clinic_id <> p_clinic_id then
    raise exception 'CLINIC_MISMATCH' using errcode = 'P0003';
  end if;

  -- 3. Validación de permisos estricta
  --    Orden: platform_admin > clinic_admin/admin > professional/doctor vinculado
  if not (
    -- platform_admin (función existente: chequea profiles.role y clinic_members.role)
    public.is_platform_admin()
    -- clinic_admin o admin activo de esa clínica
    or exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = v_uid
        and cm.active    = true
        and cm.clinic_id = p_clinic_id
        and cm.role::text in ('clinic_admin', 'admin')
    )
    -- professional/doctor activo vinculado al turno
    or exists (
      select 1 from public.clinic_members cm
      where cm.user_id         = v_uid
        and cm.active          = true
        and cm.clinic_id       = p_clinic_id
        and cm.role::text      in ('professional', 'doctor')
        and cm.professional_id = v_appt.professional_id
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- 4. Guard: ya fue iniciada
  if v_appt.attention_started_at is not null then
    raise exception 'ALREADY_STARTED' using errcode = 'P0004';
  end if;

  -- 5. Aplicar
  update public.appointments
  set
    attention_started_at = now(),
    attention_started_by = v_uid,
    updated_at           = now()
  where id = p_appointment_id;

  -- 6. Retornar fila actualizada
  select jsonb_build_object(
    'id',                    id,
    'attention_started_at',  attention_started_at,
    'attention_started_by',  attention_started_by,
    'attention_finished_at', attention_finished_at,
    'attention_finished_by', attention_finished_by,
    'updated_at',            updated_at
  )
  into v_result
  from public.appointments
  where id = p_appointment_id;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC finish_attention
-- ----------------------------------------------------------------------------
create or replace function public.finish_attention(
  p_appointment_id uuid,
  p_clinic_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_appt   record;
  v_result jsonb;
begin
  -- 1. Sesión autenticada
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  -- 2. Bloqueo de fila para serializar accesos concurrentes (evita doble finalización)
  select id, clinic_id, professional_id, attention_started_at, attention_finished_at
  into v_appt
  from public.appointments
  where id = p_appointment_id
  for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_appt.clinic_id <> p_clinic_id then
    raise exception 'CLINIC_MISMATCH' using errcode = 'P0003';
  end if;

  -- 3. Validación de permisos estricta (idéntica a start_attention)
  if not (
    public.is_platform_admin()
    or exists (
      select 1 from public.clinic_members cm
      where cm.user_id   = v_uid
        and cm.active    = true
        and cm.clinic_id = p_clinic_id
        and cm.role::text in ('clinic_admin', 'admin')
    )
    or exists (
      select 1 from public.clinic_members cm
      where cm.user_id         = v_uid
        and cm.active          = true
        and cm.clinic_id       = p_clinic_id
        and cm.role::text      in ('professional', 'doctor')
        and cm.professional_id = v_appt.professional_id
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- 4. Guards: debe haber sido iniciada, y no finalizada aún
  if v_appt.attention_started_at is null then
    raise exception 'NOT_STARTED' using errcode = 'P0004';
  end if;

  if v_appt.attention_finished_at is not null then
    raise exception 'ALREADY_FINISHED' using errcode = 'P0005';
  end if;

  -- 5. Aplicar
  update public.appointments
  set
    attention_finished_at = now(),
    attention_finished_by = v_uid,
    updated_at            = now()
  where id = p_appointment_id;

  -- 6. Retornar fila actualizada
  select jsonb_build_object(
    'id',                    id,
    'attention_started_at',  attention_started_at,
    'attention_started_by',  attention_started_by,
    'attention_finished_at', attention_finished_at,
    'attention_finished_by', attention_finished_by,
    'updated_at',            updated_at
  )
  into v_result
  from public.appointments
  where id = p_appointment_id;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Permisos
-- ----------------------------------------------------------------------------
revoke all on function public.start_attention(uuid, uuid) from public;
grant execute on function public.start_attention(uuid, uuid) to authenticated;

revoke all on function public.finish_attention(uuid, uuid) from public;
grant execute on function public.finish_attention(uuid, uuid) to authenticated;
