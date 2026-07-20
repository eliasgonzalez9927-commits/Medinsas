-- RPCs seguras para el flujo de atencion medica.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase (ver PR de esta migracion).
--
-- Por que RPC y no depender de la policy general de appointments:
-- la unica policy activa hoy sobre public.appointments es
-- "admins can manage all appointments" (FOR ALL, using is_admin()), que
-- NO compara professional_id ni clinic_id contra la fila - cualquier
-- usuario con rol de staff en CUALQUIER clinica puede hoy leer/escribir
-- CUALQUIER turno de CUALQUIER otra clinica via la API directa (RLS no
-- lo impide, solo la UI). Corregir esa policy general es un cambio de
-- alto impacto que afecta a toda la app (creacion, confirmacion,
-- cancelacion de turnos por admin/recepcion) y queda deliberadamente
-- fuera de esta migracion - requiere su propia revision.
--
-- En cambio, estas 3 funciones son SECURITY DEFINER y validan todo
-- internamente contra clinic_members (auth.uid() + clinic_id del turno +
-- professional_id del turno), sin apoyarse en la policy general. Quedan
-- seguras por si mismas independientemente de ese gap.

-- ----------------------------------------------------------------------------
-- start_medical_attention
--
-- Idempotente: si ya fue iniciada, no reinicia attention_started_at (se
-- conserva el primer inicio real). Crea el borrador de evolucion si no
-- existe (via ON CONFLICT sobre el indice parcial unico de la migracion
-- 033), sin pisar contenido si ya existia.
-- ----------------------------------------------------------------------------
create or replace function public.start_medical_attention(p_appointment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_appt record;
  v_authorized boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  select id, clinic_id, patient_id, professional_id, status, attention_started_at
    into v_appt
    from public.appointments
    where id = p_appointment_id
    for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.clinic_members cm
    where cm.user_id = v_uid
      and cm.clinic_id = v_appt.clinic_id
      and cm.professional_id = v_appt.professional_id
      and cm.active = true
      and cm.role::text in ('professional', 'doctor')
  ) into v_authorized;

  if not v_authorized then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_appt.status in ('cancelled', 'completed') then
    raise exception 'APPOINTMENT_NOT_ACTIVE' using errcode = 'P0006';
  end if;

  if v_appt.attention_started_at is null then
    update public.appointments
      set attention_started_at = now(),
          attention_started_by = v_uid,
          updated_at = now()
      where id = p_appointment_id;
  end if;

  insert into public.medical_records (
    clinic_id, patient_id, professional_id, appointment_id,
    record_type, record_status, notes, created_by, updated_by
  )
  values (
    v_appt.clinic_id, v_appt.patient_id, v_appt.professional_id, p_appointment_id,
    'appointment_evolution', 'draft', '', v_uid, v_uid
  )
  on conflict (appointment_id) where record_type = 'appointment_evolution' and appointment_id is not null
  do nothing;

  return (
    select jsonb_build_object(
      'appointment_id', id,
      'attention_started_at', attention_started_at,
      'attention_started_by', attention_started_by
    )
    from public.appointments where id = p_appointment_id
  );
end;
$$;

revoke all on function public.start_medical_attention(uuid) from public;
grant execute on function public.start_medical_attention(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- save_medical_attention_draft
--
-- Requiere que la atencion ya haya sido iniciada (existe fila draft).
-- No modifica appointments. No permite editar una evolucion ya final.
-- ----------------------------------------------------------------------------
create or replace function public.save_medical_attention_draft(p_appointment_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_appt record;
  v_record record;
  v_authorized boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  select id, clinic_id, professional_id
    into v_appt
    from public.appointments
    where id = p_appointment_id;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.clinic_members cm
    where cm.user_id = v_uid
      and cm.clinic_id = v_appt.clinic_id
      and cm.professional_id = v_appt.professional_id
      and cm.active = true
      and cm.role::text in ('professional', 'doctor')
  ) into v_authorized;

  if not v_authorized then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select id, record_status
    into v_record
    from public.medical_records
    where appointment_id = p_appointment_id
      and record_type = 'appointment_evolution'
    for update;

  if not found then
    raise exception 'ATTENTION_NOT_STARTED' using errcode = 'P0004';
  end if;

  if v_record.record_status = 'final' then
    raise exception 'EVOLUTION_ALREADY_FINAL' using errcode = 'P0005';
  end if;

  update public.medical_records
    set notes = p_notes,
        updated_at = now(),
        updated_by = v_uid
    where id = v_record.id;

  return jsonb_build_object('id', v_record.id, 'record_status', 'draft', 'updated_at', now());
end;
$$;

revoke all on function public.save_medical_attention_draft(uuid, text) from public;
grant execute on function public.save_medical_attention_draft(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- finalize_medical_attention
--
-- Transaccional y atomica: guarda la evolucion final y completa el turno
-- en la misma funcion. Si algo falla, Postgres revierte todo (no puede
-- quedar un turno completed con evolucion draft, ni al reves).
--
-- Decision de producto tomada aqui (documentada, no silenciosa): exige
-- contenido no vacio para finalizar. Si el equipo prefiere permitir
-- finalizar sin contenido con confirmacion explicita del profesional,
-- este chequeo es el punto exacto a ajustar.
-- ----------------------------------------------------------------------------
create or replace function public.finalize_medical_attention(p_appointment_id uuid, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_appt record;
  v_record record;
  v_authorized boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if p_notes is null or btrim(p_notes) = '' then
    raise exception 'EVOLUTION_CONTENT_REQUIRED' using errcode = 'P0007';
  end if;

  select id, clinic_id, professional_id, status, attention_started_at
    into v_appt
    from public.appointments
    where id = p_appointment_id
    for update;

  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.clinic_members cm
    where cm.user_id = v_uid
      and cm.clinic_id = v_appt.clinic_id
      and cm.professional_id = v_appt.professional_id
      and cm.active = true
      and cm.role::text in ('professional', 'doctor')
  ) into v_authorized;

  if not v_authorized then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_appt.status = 'completed' then
    raise exception 'ALREADY_FINALIZED' using errcode = 'P0008';
  end if;

  if v_appt.status = 'cancelled' then
    raise exception 'APPOINTMENT_NOT_ACTIVE' using errcode = 'P0006';
  end if;

  if v_appt.attention_started_at is null then
    raise exception 'ATTENTION_NOT_STARTED' using errcode = 'P0004';
  end if;

  select id, record_status
    into v_record
    from public.medical_records
    where appointment_id = p_appointment_id
      and record_type = 'appointment_evolution'
    for update;

  if not found then
    raise exception 'ATTENTION_NOT_STARTED' using errcode = 'P0004';
  end if;

  if v_record.record_status = 'final' then
    raise exception 'EVOLUTION_ALREADY_FINAL' using errcode = 'P0005';
  end if;

  update public.medical_records
    set notes = p_notes,
        record_status = 'final',
        finalized_at = now(),
        finalized_by = v_uid,
        updated_at = now(),
        updated_by = v_uid
    where id = v_record.id;

  update public.appointments
    set status = 'completed',
        attention_finished_at = now(),
        attention_finished_by = v_uid,
        updated_at = now()
    where id = p_appointment_id;

  return jsonb_build_object(
    'appointment_id', p_appointment_id,
    'record_id', v_record.id,
    'record_status', 'final',
    'status', 'completed'
  );
end;
$$;

revoke all on function public.finalize_medical_attention(uuid, text) from public;
grant execute on function public.finalize_medical_attention(uuid, text) to authenticated;
