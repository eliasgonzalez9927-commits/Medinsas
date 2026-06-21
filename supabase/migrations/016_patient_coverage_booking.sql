alter table public.patients
  add column if not exists coverage_id uuid references public.health_coverages(id) on delete set null,
  add column if not exists custom_coverage_name text,
  add column if not exists plan_name text,
  add column if not exists affiliate_number text;

create index if not exists patients_coverage_id_idx on public.patients(coverage_id);
create unique index if not exists patient_coverages_patient_coverage_unique_idx
  on public.patient_coverages(patient_id, coverage_id);

drop policy if exists "public can read selectable health coverages" on public.health_coverages;
create policy "public can read selectable health coverages"
  on public.health_coverages for select
  using (active = true and enabled_for_choice = true);

drop policy if exists "public can read accepted clinic coverages" on public.clinic_accepted_coverages;
create policy "public can read accepted clinic coverages"
  on public.clinic_accepted_coverages for select
  using (accepted = true);

drop function if exists public.create_public_booking(text, uuid, uuid, timestamptz, text, text, text, text, text, text, text);
drop function if exists public.create_public_booking(text, uuid, uuid, timestamptz, text, text, text, text, text, text, text, uuid, text);

create function public.create_public_booking(
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
  select count(*) into v_overlap_count from public.appointments where clinic_id = v_clinic.id and professional_id = p_professional_id and status in ('pending', 'confirmed', 'rescheduled', 'urgent') and starts_at < v_end_time and coalesce(end_time, starts_at + interval '30 minutes') > p_start_time;
  if v_overlap_count > 0 then raise exception 'SLOT_NOT_AVAILABLE'; end if;

  select * into v_booking_settings from public.booking_settings where clinic_id = v_clinic.id limit 1;
  v_status := case when coalesce(v_booking_settings.require_manual_confirmation, true) then 'pending'::public.appointment_status else 'confirmed'::public.appointment_status end;

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

  insert into public.appointments (clinic_id, patient_id, professional_id, service_id, starts_at, end_time, appointment_type, status, source, reason, notes, whatsapp_status)
  values (v_clinic.id, v_patient_id, p_professional_id, p_service_id, p_start_time, v_end_time, 'in_person', v_status, 'online', btrim(p_reason), btrim(p_reason), 'pending')
  returning id into v_appointment_id;

  insert into public.appointment_events (appointment_id, event_type, new_status, metadata)
  values (v_appointment_id, 'public_booking_created', v_status, jsonb_build_object('source', 'online', 'coverage_id', p_coverage_id));

  return jsonb_build_object('appointment_id', v_appointment_id, 'patient_id', v_patient_id, 'status', v_status, 'starts_at', p_start_time, 'end_time', v_end_time, 'service', v_service.name, 'professional', trim(v_professional.name || ' ' || v_professional.last_name), 'timezone', coalesce(v_clinic.timezone, 'America/Argentina/Mendoza'));
end;
$medin$;
