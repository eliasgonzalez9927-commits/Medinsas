-- Dos problemas reales encontrados al auditar el flujo de notificaciones:
--
-- 1) notification_appointment_created_trigger() solo disparaba para
--    source = 'online'. Un turno cargado manualmente por recepcion desde
--    la Agenda no generaba NINGUNA notificacion (ni para el paciente, ni
--    para la clinica). Se saca esa restriccion: ahora notifica siempre,
--    sin importar el canal de creacion del turno.
--
-- 2) No existia ningun concepto de "audiencia profesional". El medico/a
--    asignado a un turno nunca se enteraba de nada por este sistema
--    (audience solo aceptaba patient/clinic/platform). Se agrega
--    'professional' como audiencia valida, se agrega professional_id a
--    notification_events, y enqueue_notification_event() ahora resuelve
--    nombre/email/telefono desde public.professionals cuando corresponde.

do $$
begin
  alter table public.notification_events drop constraint notification_events_audience_check;
  alter table public.notification_events
    add constraint notification_events_audience_check
    check (audience in ('patient', 'clinic', 'professional', 'platform'));
exception when undefined_object then
  alter table public.notification_events
    add constraint notification_events_audience_check
    check (audience in ('patient', 'clinic', 'professional', 'platform'));
end $$;

do $$
begin
  alter table public.notification_deliveries drop constraint notification_deliveries_recipient_type_check;
  alter table public.notification_deliveries
    add constraint notification_deliveries_recipient_type_check
    check (recipient_type in ('patient', 'clinic_user', 'professional_user', 'platform_user'));
exception when undefined_object then
  alter table public.notification_deliveries
    add constraint notification_deliveries_recipient_type_check
    check (recipient_type in ('patient', 'clinic_user', 'professional_user', 'platform_user'));
end $$;

do $$
begin
  alter table public.notification_templates drop constraint notification_templates_audience_check;
  alter table public.notification_templates
    add constraint notification_templates_audience_check
    check (audience in ('patient', 'clinic', 'professional', 'platform'));
exception when undefined_object then
  alter table public.notification_templates
    add constraint notification_templates_audience_check
    check (audience in ('patient', 'clinic', 'professional', 'platform'));
end $$;

alter table public.notification_events
  add column if not exists professional_id uuid references public.professionals(id) on delete set null;

create index if not exists notification_events_professional_id_idx
  on public.notification_events(professional_id);

insert into public.notification_templates (key, channel, audience, title, body, active, metadata)
values
  ('new_booking_professional', 'in_app', 'professional', 'Nuevo turno asignado', 'Se te asigno un turno de {{service_name}} para {{appointment_datetime}} en {{clinic_name}}.', true, '{}'::jsonb)
on conflict (key) do update
set channel = excluded.channel,
    audience = excluded.audience,
    title = excluded.title,
    body = excluded.body,
    active = excluded.active;

-- enqueue_notification_event: se agrega p_professional_id (nuevo, al final,
-- con default null para no romper los callers existentes que no lo pasan)
-- y se resuelve el destinatario profesional en las tres ramas de canal.
create or replace function public.enqueue_notification_event(
  p_event_type text,
  p_audience text,
  p_clinic_id uuid default null,
  p_patient_id uuid default null,
  p_appointment_id uuid default null,
  p_payment_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_professional_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_template record;
  v_settings record;
  v_patient record;
  v_clinic record;
  v_professional record;
  v_event_id uuid;
  v_title text;
  v_message text;
  v_recipient_type text;
  v_recipient_name text;
begin
  select *
  into v_template
  from public.notification_templates
  where key = p_event_type
    and active = true
  limit 1;

  v_title := coalesce(v_template.title, p_event_type);
  v_message := public.render_notification_template(coalesce(v_template.body, ''), coalesce(p_metadata, '{}'::jsonb));

  select * into v_clinic from public.clinics where id = p_clinic_id;
  select * into v_patient from public.patients where id = p_patient_id;
  select * into v_professional from public.professionals where id = p_professional_id;

  select *
  into v_settings
  from public.clinic_notification_settings
  where clinic_id = p_clinic_id;

  if p_event_type in ('new_booking_clinic', 'appointment_created_patient', 'appointment_no_payment_patient', 'new_booking_professional')
    and coalesce(v_settings.notify_new_booking, true) = false then
    return null;
  end if;

  if p_event_type in ('payment_approved_patient', 'payment_approved_clinic')
    and coalesce(v_settings.notify_payment_approved, true) = false then
    return null;
  end if;

  if p_event_type = 'reschedule_requested_clinic'
    and coalesce(v_settings.notify_reschedule_requests, true) = false then
    return null;
  end if;

  if p_event_type = 'cancellation_requested_clinic'
    and coalesce(v_settings.notify_cancellation_requests, true) = false then
    return null;
  end if;

  insert into public.notification_events (
    clinic_id,
    patient_id,
    appointment_id,
    payment_id,
    professional_id,
    event_type,
    audience,
    title,
    message,
    status,
    metadata
  )
  values (
    p_clinic_id,
    p_patient_id,
    p_appointment_id,
    p_payment_id,
    p_professional_id,
    p_event_type,
    p_audience,
    v_title,
    nullif(v_message, ''),
    'pending',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  v_recipient_type := case
    when p_audience = 'patient' then 'patient'
    when p_audience = 'professional' then 'professional_user'
    when p_audience = 'platform' then 'platform_user'
    else 'clinic_user'
  end;

  v_recipient_name := case
    when p_audience = 'patient' then concat_ws(' ', v_patient.first_name, v_patient.last_name)
    when p_audience = 'professional' then concat_ws(' ', v_professional.name, v_professional.last_name)
    when p_audience = 'clinic' then v_clinic.name
    else 'Medin'
  end;

  if coalesce(v_settings.in_app_enabled, true) then
    insert into public.notification_deliveries (
      event_id,
      clinic_id,
      channel,
      recipient_type,
      recipient_name,
      status,
      provider,
      metadata
    )
    values (
      v_event_id,
      p_clinic_id,
      'in_app',
      v_recipient_type,
      v_recipient_name,
      'pending',
      'medin',
      coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  if coalesce(v_settings.email_enabled, true) then
    insert into public.notification_deliveries (
      event_id,
      clinic_id,
      channel,
      recipient_type,
      recipient_name,
      recipient_email,
      status,
      provider,
      metadata
    )
    values (
      v_event_id,
      p_clinic_id,
      'email',
      v_recipient_type,
      v_recipient_name,
      case
        when p_audience = 'patient' then v_patient.email
        when p_audience = 'professional' then v_professional.email
        when p_audience = 'clinic' then v_clinic.email
        else null
      end,
      case
        when p_audience = 'patient' and nullif(v_patient.email, '') is null then 'skipped'
        when p_audience = 'professional' and nullif(v_professional.email, '') is null then 'skipped'
        when p_audience = 'clinic' and nullif(v_clinic.email, '') is null then 'skipped'
        when p_audience = 'platform' then 'skipped'
        else 'pending'
      end,
      'resend',
      coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  insert into public.notification_deliveries (
    event_id,
    clinic_id,
    channel,
    recipient_type,
    recipient_name,
    recipient_phone,
    status,
    provider,
    error_message,
    metadata
  )
  values (
    v_event_id,
    p_clinic_id,
    'whatsapp',
    v_recipient_type,
    v_recipient_name,
    case
      when p_audience = 'patient' then v_patient.phone
      when p_audience = 'professional' then v_professional.phone
      when p_audience = 'clinic' then coalesce(v_settings.whatsapp_phone_number, v_clinic.whatsapp, v_clinic.phone)
      else null
    end,
    case
      when coalesce(v_settings.whatsapp_enabled, false) = false then 'skipped'
      when p_audience = 'patient' and nullif(v_patient.phone, '') is null then 'skipped'
      when p_audience = 'professional' and nullif(v_professional.phone, '') is null then 'skipped'
      when p_audience = 'clinic' and nullif(coalesce(v_settings.whatsapp_phone_number, v_clinic.whatsapp, v_clinic.phone), '') is null then 'skipped'
      when p_audience = 'platform' then 'skipped'
      else 'pending'
    end,
    'whatsapp_future',
    case
      when coalesce(v_settings.whatsapp_enabled, false) = false then 'WhatsApp automático todavía no está activo.'
      else null
    end,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return v_event_id;
end;
$$;

-- Trigger de turno creado: ahora dispara siempre (no solo online) y agrega
-- la notificacion al profesional asignado.
create or replace function public.notification_appointment_created_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service record;
  v_clinic record;
  v_patient record;
  v_professional record;
  v_patient_event text;
  v_metadata jsonb;
begin
  select * into v_service from public.services where id = new.service_id;
  select * into v_clinic from public.clinics where id = new.clinic_id;
  select * into v_patient from public.patients where id = new.patient_id;
  select * into v_professional from public.professionals where id = new.professional_id;

  v_metadata := jsonb_build_object(
    'service_name', coalesce(v_service.name, new.reason, 'Turno'),
    'clinic_name', coalesce(v_clinic.name, 'Medin'),
    'patient_name', concat_ws(' ', v_patient.first_name, v_patient.last_name),
    'professional_name', concat_ws(' ', v_professional.name, v_professional.last_name),
    'appointment_datetime', coalesce(new.starts_at::text, ''),
    'public_code', new.public_code,
    'source', new.source
  );

  perform public.enqueue_notification_event(
    'new_booking_clinic',
    'clinic',
    new.clinic_id,
    new.patient_id,
    new.id,
    null,
    v_metadata
  );

  v_patient_event := case
    when coalesce(v_service.payment_required, false) = false
      and coalesce(v_service.deposit_required, false) = false
      then 'appointment_no_payment_patient'
    else 'appointment_created_patient'
  end;

  perform public.enqueue_notification_event(
    v_patient_event,
    'patient',
    new.clinic_id,
    new.patient_id,
    new.id,
    null,
    v_metadata
  );

  if new.professional_id is not null then
    perform public.enqueue_notification_event(
      'new_booking_professional',
      'professional',
      new.clinic_id,
      new.patient_id,
      new.id,
      null,
      v_metadata,
      new.professional_id
    );
  end if;

  return new;
exception when others then
  raise notice 'notification_appointment_created_trigger skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notification_appointment_created_after_insert on public.appointments;
create trigger notification_appointment_created_after_insert
  after insert on public.appointments
  for each row execute function public.notification_appointment_created_trigger();
