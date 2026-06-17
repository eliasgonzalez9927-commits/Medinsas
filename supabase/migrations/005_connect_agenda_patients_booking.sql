alter table public.patients
  add column if not exists updated_at timestamptz not null default now();

alter table public.appointments
  add column if not exists cancellation_reason text,
  add column if not exists rescheduled_from_id uuid references public.appointments(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.appointments
  drop constraint if exists appointments_patient_id_fkey,
  drop constraint if exists appointments_unique_slot;

alter table public.appointments
  add constraint appointments_patient_id_fkey
  foreign key (patient_id) references public.patients(id) on delete cascade
  not valid;

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  event_type text not null,
  old_status public.appointment_status,
  new_status public.appointment_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists appointments_clinic_start_idx on public.appointments(clinic_id, starts_at);
create index if not exists appointments_professional_start_idx on public.appointments(professional_id, starts_at);
create index if not exists patients_clinic_phone_idx on public.patients(clinic_id, phone);
create index if not exists appointment_events_appointment_id_idx on public.appointment_events(appointment_id);

alter table public.appointment_events enable row level security;

drop policy if exists "admins can manage appointment events" on public.appointment_events;

create policy "admins can manage appointment events"
  on public.appointment_events for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "patients can read own appointments" on public.appointments;
drop policy if exists "patients can create own appointments" on public.appointments;
drop policy if exists "admins can manage all appointments" on public.appointments;

create policy "admins can manage all appointments"
  on public.appointments for all
  using (public.is_admin())
  with check (public.is_admin());

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
  generated_slots as (
    select
      slot_start,
      slot_start + make_interval(mins => ctx.duration_minutes) as slot_end,
      ctx.duration_minutes
    from context ctx
    join public.availability_rules ar
      on ar.clinic_id = ctx.clinic_id
     and ar.professional_id = p_professional_id
     and ar.active = true
     and ar.day_of_week = extract(dow from p_date)::integer
    cross join lateral generate_series(
      (p_date + ar.start_time)::timestamptz,
      (p_date + ar.end_time)::timestamptz - make_interval(mins => ctx.duration_minutes),
      make_interval(mins => ctx.duration_minutes)
    ) as slot_start
    where p_date <= current_date + ctx.max_days_ahead
      and slot_start >= now() + make_interval(hours => ctx.min_notice_hours)
  )
  select
    to_char(slot_start, 'HH24:MI') as time,
    slot_start as starts_at,
    slot_end as end_time
  from generated_slots gs
  where not exists (
    select 1
    from public.availability_blocks ab
    where ab.professional_id = p_professional_id
      and ab.date = p_date
      and (p_date + ab.start_time)::timestamptz < gs.slot_end
      and (p_date + ab.end_time)::timestamptz > gs.slot_start
  )
    and not exists (
      select 1
      from public.appointments a
      where a.professional_id = p_professional_id
        and a.status in ('pending', 'confirmed', 'rescheduled', 'urgent')
        and a.starts_at < gs.slot_end
        and coalesce(a.end_time, a.starts_at + make_interval(mins => gs.duration_minutes)) > gs.slot_start
    )
  order by slot_start;
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
    jsonb_build_object('source', 'online', 'whatsapp_status', 'pending')
  );

  return jsonb_build_object(
    'appointment_id', v_appointment_id,
    'patient_id', v_patient_id,
    'status', v_status,
    'starts_at', p_start_time,
    'end_time', v_end_time,
    'service', v_service.name,
    'professional', trim(v_professional.name || ' ' || v_professional.last_name)
  );
end;
$$;
