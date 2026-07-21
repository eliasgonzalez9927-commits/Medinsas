-- Las reservas online de un servicio con seña/pago requerido quedaban
-- creadas en la base ANTES de generar el link de pago. Si ese paso
-- fallaba por cualquier motivo (Mercado Pago caido, el navegador se
-- cierra, el flag todavia apagado), el turno quedaba "pending" para
-- siempre, ocupando el horario, sin ningun rastro de que necesitaba
-- pago (create_public_booking nunca guardaba payment_required ni
-- deposit_amount en el turno).
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.
--
-- Alcance: solo reservas online (create_public_booking /
-- get_public_available_slots). Los turnos manuales/sobreturnos que
-- carga el equipo desde el panel siguen igual, sin cambios - ahi el
-- admin decide a criterio.
alter table public.appointments
  add column if not exists payment_hold_expires_at timestamptz;

create or replace function public.get_public_available_slots(
  p_clinic_slug text,
  p_professional_id uuid,
  p_service_id uuid,
  p_date date
)
returns table (
  time text,
  starts_at timestamptz,
  end_time timestamptz
)
language sql
security definer
set search_path = public
as $$
  with context as (
    select
      c.id as clinic_id,
      coalesce(c.timezone, 'America/Argentina/Mendoza') as clinic_timezone,
      s.duration_minutes,
      coalesce(bs.min_notice_hours, 0) as min_notice_hours,
      coalesce(bs.max_days_ahead, 45) as max_days_ahead
    from public.clinics c
    join public.services s
      on s.clinic_id = c.id
     and s.id = p_service_id
     and s.active = true
     and s.public_booking_enabled = true
    join public.professionals p
      on p.clinic_id = c.id
     and p.id = p_professional_id
     and p.active = true
    left join public.booking_settings bs on bs.clinic_id = c.id
    where c.slug = p_clinic_slug
      and exists (
        select 1
        from public.professional_services ps
        where ps.professional_id = p_professional_id
          and ps.service_id = p_service_id
      )
  ),
  normalized_slots as (
    select
      local_slot_start as slot_start,
      local_slot_start + make_interval(mins => duration_minutes) as slot_end,
      duration_minutes,
      clinic_timezone
    from context ctx
    join public.availability_rules ar
      on ar.clinic_id = ctx.clinic_id
     and ar.professional_id = p_professional_id
     and ar.active = true
     and ar.day_of_week = extract(dow from p_date)::integer
    cross join lateral generate_series(
      0,
      floor(extract(epoch from (ar.end_time - ar.start_time)) / 60)::integer - ctx.duration_minutes,
      ctx.duration_minutes
    ) as offsets(slot_offset_minutes)
    cross join lateral (
      select ((p_date + (ar.start_time + make_interval(mins => slot_offset_minutes))) at time zone ctx.clinic_timezone) as local_slot_start
    ) local_slot
    where p_date <= (now() at time zone ctx.clinic_timezone)::date + ctx.max_days_ahead
      and local_slot.local_slot_start >= now() + make_interval(hours => ctx.min_notice_hours)
  )
  select
    to_char(ns.slot_start at time zone ns.clinic_timezone, 'HH24:MI') as time,
    ns.slot_start as starts_at,
    ns.slot_end as end_time
  from normalized_slots ns
  where not exists (
    select 1
    from public.availability_blocks ab
    where ab.professional_id = p_professional_id
      and ab.date = p_date
      and ((p_date + ab.start_time) at time zone ns.clinic_timezone) < ns.slot_end
      and ((p_date + ab.end_time) at time zone ns.clinic_timezone) > ns.slot_start
  )
    and not exists (
      select 1
      from public.appointments a
      where a.professional_id = p_professional_id
        and a.status in ('pending', 'confirmed', 'rescheduled', 'urgent')
        -- un turno pending que requeria pago y vencio su ventana sin
        -- pagarse deja de bloquear el horario para otros pacientes.
        and not (
          a.status = 'pending'
          and coalesce(a.payment_required, false)
          and a.payment_hold_expires_at is not null
          and a.payment_hold_expires_at < now()
        )
        and a.starts_at < ns.slot_end
        and coalesce(a.end_time, a.starts_at + make_interval(mins => ns.duration_minutes)) > ns.slot_start
    )
  order by ns.slot_start;
$$;

create or replace function public.create_public_booking(
  p_clinic_slug text,
  p_professional_id uuid,
  p_service_id uuid,
  p_start_time timestamptz,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_document_number text,
  p_insurance text,
  p_reason text,
  p_coverage_id uuid default null,
  p_custom_coverage_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $medin$
declare
  v_clinic public.clinics%rowtype;
  v_service public.services%rowtype;
  v_professional public.professionals%rowtype;
  v_booking_settings public.booking_settings%rowtype;
  v_patient_id uuid;
  v_appointment_id uuid;
  v_end_time timestamptz;
  v_status public.appointment_status;
  v_overlap_count integer;
  v_coverage_name text;
  v_payment_required boolean;
  v_deposit_amount numeric(12, 2);
  v_hold_minutes integer;
  v_hold_expires_at timestamptz;
begin
  if coalesce(btrim(p_first_name), '') = '' then raise exception 'FIRST_NAME_REQUIRED'; end if;
  if coalesce(btrim(p_last_name), '') = '' then raise exception 'LAST_NAME_REQUIRED'; end if;
  if coalesce(btrim(p_phone), '') = '' then raise exception 'PHONE_REQUIRED'; end if;
  if coalesce(btrim(p_email), '') = '' or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'VALID_EMAIL_REQUIRED'; end if;
  if coalesce(btrim(p_document_number), '') = '' then raise exception 'DOCUMENT_REQUIRED'; end if;
  if coalesce(btrim(p_insurance), '') = '' then raise exception 'COVERAGE_REQUIRED'; end if;
  if lower(btrim(p_insurance)) = 'otra' and coalesce(btrim(p_custom_coverage_name), '') = '' then raise exception 'CUSTOM_COVERAGE_REQUIRED'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;

  select * into v_clinic from public.clinics where slug = p_clinic_slug;
  if v_clinic.id is null then raise exception 'CLINIC_NOT_FOUND'; end if;

  if p_coverage_id is not null then
    select name into v_coverage_name from public.health_coverages where id = p_coverage_id and active = true;
    if v_coverage_name is null then raise exception 'COVERAGE_NOT_FOUND'; end if;
  end if;

  select * into v_service from public.services where id = p_service_id and clinic_id = v_clinic.id and active = true and public_booking_enabled = true;
  if v_service.id is null then raise exception 'SERVICE_NOT_AVAILABLE'; end if;
  select * into v_professional from public.professionals where id = p_professional_id and clinic_id = v_clinic.id and active = true;
  if v_professional.id is null then raise exception 'PROFESSIONAL_NOT_AVAILABLE'; end if;
  if not exists (select 1 from public.professional_services where professional_id = p_professional_id and service_id = p_service_id) then raise exception 'PROFESSIONAL_SERVICE_NOT_AVAILABLE'; end if;

  v_end_time := p_start_time + make_interval(mins => v_service.duration_minutes);

  v_payment_required := coalesce(v_service.payment_required, false) or coalesce(v_service.deposit_required, false);
  v_deposit_amount := case when v_service.deposit_required then coalesce(v_service.deposit_amount, v_service.price) else null end;

  select count(*) into v_overlap_count
    from public.appointments a
    where a.clinic_id = v_clinic.id
      and a.professional_id = p_professional_id
      and a.status in ('pending', 'confirmed', 'rescheduled', 'urgent')
      and not (
        a.status = 'pending'
        and coalesce(a.payment_required, false)
        and a.payment_hold_expires_at is not null
        and a.payment_hold_expires_at < now()
      )
      and a.starts_at < v_end_time
      and coalesce(a.end_time, a.starts_at + interval '30 minutes') > p_start_time;
  if v_overlap_count > 0 then raise exception 'SLOT_NOT_AVAILABLE'; end if;

  select * into v_booking_settings from public.booking_settings where clinic_id = v_clinic.id limit 1;

  -- Un servicio que requiere pago nunca puede quedar "confirmed" solo -
  -- pisa la config de confirmacion manual de la clinica, no al reves.
  v_status := case
    when v_payment_required then 'pending'::public.appointment_status
    when coalesce(v_booking_settings.require_manual_confirmation, true) then 'pending'::public.appointment_status
    else 'confirmed'::public.appointment_status
  end;

  if v_payment_required then
    select coalesce(ps.payment_link_expiration_minutes, 1440)
      into v_hold_minutes
      from public.payment_settings ps
      where ps.clinic_id = v_clinic.id and ps.provider = 'mercado_pago';
    v_hold_expires_at := now() + make_interval(mins => coalesce(v_hold_minutes, 1440));
  else
    v_hold_expires_at := null;
  end if;

  select id into v_patient_id from public.patients where clinic_id = v_clinic.id and (document_number = p_document_number or email = p_email or phone = p_phone) order by case when document_number = p_document_number then 1 when email = p_email then 2 else 3 end limit 1;
  if v_patient_id is null then
    insert into public.patients (clinic_id, first_name, last_name, phone, email, document_number, insurance, coverage_id, custom_coverage_name, notes)
    values (v_clinic.id, btrim(p_first_name), btrim(p_last_name), btrim(p_phone), lower(btrim(p_email)), btrim(p_document_number), coalesce(v_coverage_name, p_insurance), p_coverage_id, case when lower(btrim(p_insurance)) = 'otra' then btrim(p_custom_coverage_name) else null end, btrim(p_reason))
    returning id into v_patient_id;
  else
    update public.patients set first_name = btrim(p_first_name), last_name = btrim(p_last_name), phone = btrim(p_phone), email = lower(btrim(p_email)), document_number = btrim(p_document_number), insurance = coalesce(v_coverage_name, p_insurance), coverage_id = p_coverage_id, custom_coverage_name = case when lower(btrim(p_insurance)) = 'otra' then btrim(p_custom_coverage_name) else null end, updated_at = now() where id = v_patient_id;
  end if;

  if p_coverage_id is not null then
    insert into public.patient_coverages (patient_id, coverage_id, active)
    values (v_patient_id, p_coverage_id, true)
    on conflict (patient_id, coverage_id) do update set active = true, updated_at = now();
  end if;

  insert into public.appointments (clinic_id, patient_id, professional_id, service_id, starts_at, end_time, appointment_type, status, source, reason, notes, whatsapp_status, payment_required, deposit_amount, payment_hold_expires_at)
  values (v_clinic.id, v_patient_id, p_professional_id, p_service_id, p_start_time, v_end_time, 'in_person', v_status, 'online', btrim(p_reason), btrim(p_reason), 'pending', v_payment_required, v_deposit_amount, v_hold_expires_at)
  returning id into v_appointment_id;

  insert into public.appointment_events (appointment_id, event_type, new_status, metadata)
  values (v_appointment_id, 'public_booking_created', v_status, jsonb_build_object('source', 'online', 'coverage_id', p_coverage_id, 'payment_required', v_payment_required));

  return jsonb_build_object('appointment_id', v_appointment_id, 'patient_id', v_patient_id, 'status', v_status, 'starts_at', p_start_time, 'end_time', v_end_time, 'service', v_service.name, 'professional', trim(v_professional.name || ' ' || v_professional.last_name), 'timezone', coalesce(v_clinic.timezone, 'America/Argentina/Mendoza'), 'payment_required', v_payment_required, 'deposit_amount', v_deposit_amount);
end;
$medin$;
