alter table public.clinics
  add column if not exists timezone text not null default 'America/Argentina/Mendoza';

update public.clinics
set timezone = 'America/Argentina/Mendoza'
where slug = 'clinica-central'
  and coalesce(timezone, '') <> 'America/Argentina/Mendoza';

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
  p_email text default null,
  p_document_number text default null,
  p_insurance text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
begin
  select * into v_clinic
  from public.clinics
  where slug = p_clinic_slug;

  if v_clinic.id is null then
    raise exception 'CLINIC_NOT_FOUND';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and clinic_id = v_clinic.id
    and active = true
    and public_booking_enabled = true;

  if v_service.id is null then
    raise exception 'SERVICE_NOT_AVAILABLE';
  end if;

  select * into v_professional
  from public.professionals
  where id = p_professional_id
    and clinic_id = v_clinic.id
    and active = true;

  if v_professional.id is null then
    raise exception 'PROFESSIONAL_NOT_AVAILABLE';
  end if;

  if not exists (
    select 1
    from public.professional_services
    where professional_id = p_professional_id
      and service_id = p_service_id
  ) then
    raise exception 'PROFESSIONAL_SERVICE_NOT_AVAILABLE';
  end if;

  v_end_time := p_start_time + make_interval(mins => v_service.duration_minutes);

  select count(*) into v_overlap_count
  from public.appointments
  where clinic_id = v_clinic.id
    and professional_id = p_professional_id
    and status in ('pending', 'confirmed', 'rescheduled', 'urgent')
    and starts_at < v_end_time
    and coalesce(end_time, starts_at + interval '30 minutes') > p_start_time;

  if v_overlap_count > 0 then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  select * into v_booking_settings
  from public.booking_settings
  where clinic_id = v_clinic.id
  limit 1;

  v_status := case
    when coalesce(v_booking_settings.require_manual_confirmation, true) then 'pending'::public.appointment_status
    else 'confirmed'::public.appointment_status
  end;

  select id into v_patient_id
  from public.patients
  where clinic_id = v_clinic.id
    and phone = p_phone
  limit 1;

  if v_patient_id is null then
    insert into public.patients (
      clinic_id, first_name, last_name, phone, email, document_number, insurance, notes
    )
    values (
      v_clinic.id, p_first_name, p_last_name, p_phone, p_email, p_document_number, p_insurance, p_reason
    )
    returning id into v_patient_id;
  else
    update public.patients
    set first_name = p_first_name,
        last_name = p_last_name,
        email = coalesce(p_email, email),
        document_number = coalesce(p_document_number, document_number),
        insurance = coalesce(p_insurance, insurance),
        updated_at = now()
    where id = v_patient_id;
  end if;

  insert into public.appointments (
    clinic_id,
    patient_id,
    professional_id,
    service_id,
    starts_at,
    end_time,
    appointment_type,
    status,
    source,
    reason,
    notes,
    whatsapp_status
  )
  values (
    v_clinic.id,
    v_patient_id,
    p_professional_id,
    p_service_id,
    p_start_time,
    v_end_time,
    'in_person',
    v_status,
    'online',
    coalesce(p_reason, v_service.name),
    p_reason,
    'pending'
  )
  returning id into v_appointment_id;

  insert into public.appointment_events (appointment_id, event_type, new_status, metadata)
  values (
    v_appointment_id,
    'public_booking_created',
    v_status,
    jsonb_build_object(
      'source', 'online',
      'whatsapp_status', 'pending',
      'clinic_timezone', coalesce(v_clinic.timezone, 'America/Argentina/Mendoza')
    )
  );

  return jsonb_build_object(
    'appointment_id', v_appointment_id,
    'patient_id', v_patient_id,
    'status', v_status,
    'starts_at', p_start_time,
    'end_time', v_end_time,
    'timezone', coalesce(v_clinic.timezone, 'America/Argentina/Mendoza'),
    'service', v_service.name,
    'professional', trim(v_professional.name || ' ' || v_professional.last_name)
  );
end;
$$;
