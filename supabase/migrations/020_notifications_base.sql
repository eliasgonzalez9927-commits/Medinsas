create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  event_type text not null,
  audience text not null,
  title text not null,
  message text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.notification_events(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  channel text not null,
  recipient_type text not null,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  status text not null default 'pending',
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  channel text not null,
  audience text not null,
  title text,
  body text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_notification_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  reminder_24h_enabled boolean not null default true,
  reminder_2h_enabled boolean not null default false,
  notify_new_booking boolean not null default true,
  notify_payment_approved boolean not null default true,
  notify_reschedule_requests boolean not null default true,
  notify_cancellation_requests boolean not null default true,
  whatsapp_phone_number text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_events_clinic_created_idx
  on public.notification_events(clinic_id, created_at desc);
create index if not exists notification_events_event_type_idx
  on public.notification_events(event_type);
create index if not exists notification_events_status_idx
  on public.notification_events(status);
create index if not exists notification_events_appointment_id_idx
  on public.notification_events(appointment_id);
create index if not exists notification_events_patient_id_idx
  on public.notification_events(patient_id);
create index if not exists notification_deliveries_event_id_idx
  on public.notification_deliveries(event_id);
create index if not exists notification_deliveries_clinic_status_idx
  on public.notification_deliveries(clinic_id, status);
create index if not exists notification_templates_key_idx
  on public.notification_templates(key);
create unique index if not exists clinic_notification_settings_clinic_id_idx
  on public.clinic_notification_settings(clinic_id);

do $$
begin
  alter table public.notification_events
    add constraint notification_events_audience_check
    check (audience in ('patient', 'clinic', 'platform'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.notification_events
    add constraint notification_events_status_check
    check (status in ('pending', 'processed', 'cancelled', 'failed'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.notification_deliveries
    add constraint notification_deliveries_channel_check
    check (channel in ('in_app', 'email', 'whatsapp'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.notification_deliveries
    add constraint notification_deliveries_recipient_type_check
    check (recipient_type in ('patient', 'clinic_user', 'platform_user'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.notification_deliveries
    add constraint notification_deliveries_status_check
    check (status in ('pending', 'sent', 'failed', 'skipped'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.notification_templates
    add constraint notification_templates_channel_check
    check (channel in ('email', 'whatsapp', 'in_app'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.notification_templates
    add constraint notification_templates_audience_check
    check (audience in ('patient', 'clinic', 'platform'));
exception when duplicate_object then null;
end $$;

alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_templates enable row level security;
alter table public.clinic_notification_settings enable row level security;

drop policy if exists "platform manages notification events" on public.notification_events;
create policy "platform manages notification events"
  on public.notification_events for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "clinic members read notification events" on public.notification_events;
create policy "clinic members read notification events"
  on public.notification_events for select
  using (public.can_access_clinic(clinic_id));

drop policy if exists "clinic members update notification events" on public.notification_events;
create policy "clinic members update notification events"
  on public.notification_events for update
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

drop policy if exists "clinic members insert notification events" on public.notification_events;
create policy "clinic members insert notification events"
  on public.notification_events for insert
  with check (public.can_access_clinic(clinic_id) or public.is_platform_admin());

drop policy if exists "platform manages notification deliveries" on public.notification_deliveries;
create policy "platform manages notification deliveries"
  on public.notification_deliveries for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "clinic members read notification deliveries" on public.notification_deliveries;
create policy "clinic members read notification deliveries"
  on public.notification_deliveries for select
  using (public.can_access_clinic(clinic_id));

drop policy if exists "clinic members update notification deliveries" on public.notification_deliveries;
create policy "clinic members update notification deliveries"
  on public.notification_deliveries for update
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

drop policy if exists "platform manages notification templates" on public.notification_templates;
create policy "platform manages notification templates"
  on public.notification_templates for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "clinic members read active notification templates" on public.notification_templates;
create policy "clinic members read active notification templates"
  on public.notification_templates for select
  using (active = true and public.is_admin());

drop policy if exists "platform manages clinic notification settings" on public.clinic_notification_settings;
create policy "platform manages clinic notification settings"
  on public.clinic_notification_settings for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "clinic members read notification settings" on public.clinic_notification_settings;
create policy "clinic members read notification settings"
  on public.clinic_notification_settings for select
  using (public.can_access_clinic(clinic_id));

drop policy if exists "clinic admins update notification settings" on public.clinic_notification_settings;
create policy "clinic admins update notification settings"
  on public.clinic_notification_settings for update
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.clinic_members cm
      where cm.clinic_id = clinic_notification_settings.clinic_id
        and cm.user_id = auth.uid()
        and cm.active = true
        and cm.role::text in ('clinic_admin', 'platform_admin')
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.clinic_members cm
      where cm.clinic_id = clinic_notification_settings.clinic_id
        and cm.user_id = auth.uid()
        and cm.active = true
        and cm.role::text in ('clinic_admin', 'platform_admin')
    )
  );

insert into public.notification_templates (key, channel, audience, title, body, active, metadata)
values
  ('appointment_created_patient', 'in_app', 'patient', 'Tu turno fue solicitado', 'Recibimos tu solicitud de turno para {{service_name}} en {{clinic_name}}.', true, '{}'::jsonb),
  ('appointment_confirmed_patient', 'in_app', 'patient', 'Tu turno fue confirmado', 'Tu turno en {{clinic_name}} quedó confirmado para {{appointment_datetime}}.', true, '{}'::jsonb),
  ('appointment_no_payment_patient', 'in_app', 'patient', 'Tu turno fue registrado', 'Tu turno no requiere pago online. La clínica confirmará las condiciones de atención.', true, '{}'::jsonb),
  ('payment_pending_patient', 'in_app', 'patient', 'Pago pendiente', 'Para completar tu reserva, continuá con el pago.', true, '{}'::jsonb),
  ('payment_approved_patient', 'in_app', 'patient', 'Pago aprobado', 'Tu pago fue aprobado y tu turno quedó registrado.', true, '{}'::jsonb),
  ('new_booking_clinic', 'in_app', 'clinic', 'Nueva reserva online', 'Se registró una nueva reserva desde la página pública.', true, '{}'::jsonb),
  ('payment_approved_clinic', 'in_app', 'clinic', 'Nuevo pago aprobado', 'Se aprobó un pago asociado a un turno.', true, '{}'::jsonb),
  ('reschedule_requested_clinic', 'in_app', 'clinic', 'Nueva solicitud de reprogramación', 'Un paciente solicitó reprogramar su turno.', true, '{}'::jsonb),
  ('cancellation_requested_clinic', 'in_app', 'clinic', 'Nueva solicitud de cancelación', 'Un paciente solicitó cancelar su turno.', true, '{}'::jsonb),
  ('overbooking_created_clinic', 'in_app', 'clinic', 'Sobreturno creado', 'Se creó un sobreturno como excepción interna.', true, '{}'::jsonb),
  ('plan_change_requested_platform', 'in_app', 'platform', 'Nueva solicitud de cambio de plan', 'Una clínica solicitó cambiar su plan.', true, '{}'::jsonb)
on conflict (key) do update
set channel = excluded.channel,
    audience = excluded.audience,
    title = excluded.title,
    body = excluded.body,
    active = excluded.active,
    metadata = excluded.metadata,
    updated_at = now();

insert into public.clinic_notification_settings (clinic_id)
select c.id
from public.clinics c
on conflict (clinic_id) do nothing;

create or replace function public.render_notification_template(p_body text, p_variables jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_result text := coalesce(p_body, '');
  v_key text;
  v_value text;
begin
  for v_key, v_value in select key, value #>> '{}' from jsonb_each(coalesce(p_variables, '{}'::jsonb))
  loop
    v_result := replace(v_result, '{{' || v_key || '}}', coalesce(v_value, ''));
  end loop;
  return v_result;
end;
$$;

create or replace function public.enqueue_notification_event(
  p_event_type text,
  p_audience text,
  p_clinic_id uuid default null,
  p_patient_id uuid default null,
  p_appointment_id uuid default null,
  p_payment_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template record;
  v_settings record;
  v_patient record;
  v_clinic record;
  v_event_id uuid;
  v_title text;
  v_message text;
  v_recipient_type text;
begin
  select *
  into v_template
  from public.notification_templates
  where key = p_event_type
    and active = true
  limit 1;

  v_title := coalesce(v_template.title, p_event_type);
  v_message := public.render_notification_template(coalesce(v_template.body, ''), coalesce(p_metadata, '{}'::jsonb));

  select *
  into v_clinic
  from public.clinics
  where id = p_clinic_id;

  select *
  into v_patient
  from public.patients
  where id = p_patient_id;

  select *
  into v_settings
  from public.clinic_notification_settings
  where clinic_id = p_clinic_id;

  if p_event_type in ('new_booking_clinic', 'appointment_created_patient', 'appointment_no_payment_patient')
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
    when p_audience = 'platform' then 'platform_user'
    else 'clinic_user'
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
      case
        when p_audience = 'patient' then concat_ws(' ', v_patient.first_name, v_patient.last_name)
        when p_audience = 'clinic' then v_clinic.name
        else 'Medin'
      end,
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
      case
        when p_audience = 'patient' then concat_ws(' ', v_patient.first_name, v_patient.last_name)
        when p_audience = 'clinic' then v_clinic.name
        else 'Medin'
      end,
      case
        when p_audience = 'patient' then v_patient.email
        when p_audience = 'clinic' then v_clinic.email
        else null
      end,
      case
        when p_audience = 'patient' and nullif(v_patient.email, '') is null then 'skipped'
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
    case
      when p_audience = 'patient' then concat_ws(' ', v_patient.first_name, v_patient.last_name)
      when p_audience = 'clinic' then v_clinic.name
      else 'Medin'
    end,
    case
      when p_audience = 'patient' then v_patient.phone
      when p_audience = 'clinic' then coalesce(v_settings.whatsapp_phone_number, v_clinic.whatsapp, v_clinic.phone)
      else null
    end,
    case
      when coalesce(v_settings.whatsapp_enabled, false) = false then 'skipped'
      when p_audience = 'patient' and nullif(v_patient.phone, '') is null then 'skipped'
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

create or replace function public.notification_appointment_created_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
  v_clinic record;
  v_patient record;
  v_patient_event text;
  v_metadata jsonb;
begin
  if new.source is distinct from 'online' then
    return new;
  end if;

  select * into v_service from public.services where id = new.service_id;
  select * into v_clinic from public.clinics where id = new.clinic_id;
  select * into v_patient from public.patients where id = new.patient_id;

  v_metadata := jsonb_build_object(
    'service_name', coalesce(v_service.name, new.reason, 'Turno'),
    'clinic_name', coalesce(v_clinic.name, 'Medin'),
    'patient_name', concat_ws(' ', v_patient.first_name, v_patient.last_name),
    'appointment_datetime', coalesce(new.starts_at::text, ''),
    'public_code', new.public_code
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

create or replace function public.notification_payment_approved_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment record;
  v_service record;
  v_clinic record;
  v_patient_id uuid;
  v_metadata jsonb;
begin
  if new.status is distinct from 'approved' or old.status is not distinct from 'approved' then
    return new;
  end if;

  select * into v_appointment from public.appointments where id = new.appointment_id;
  select * into v_service from public.services where id = coalesce(new.service_id, v_appointment.service_id);
  select * into v_clinic from public.clinics where id = new.clinic_id;
  v_patient_id := coalesce(new.patient_id, v_appointment.patient_id);

  v_metadata := jsonb_build_object(
    'service_name', coalesce(v_service.name, v_appointment.reason, 'Turno'),
    'clinic_name', coalesce(v_clinic.name, 'Medin'),
    'amount', new.amount,
    'currency', new.currency,
    'provider', coalesce(new.provider, 'mercado_pago'),
    'appointment_datetime', coalesce(v_appointment.starts_at::text, ''),
    'public_code', v_appointment.public_code
  );

  perform public.enqueue_notification_event(
    'payment_approved_patient',
    'patient',
    new.clinic_id,
    v_patient_id,
    new.appointment_id,
    new.id,
    v_metadata
  );

  perform public.enqueue_notification_event(
    'payment_approved_clinic',
    'clinic',
    new.clinic_id,
    v_patient_id,
    new.appointment_id,
    new.id,
    v_metadata
  );

  return new;
exception when others then
  raise notice 'notification_payment_approved_trigger skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notification_payment_approved_after_update on public.payments;
create trigger notification_payment_approved_after_update
  after update on public.payments
  for each row execute function public.notification_payment_approved_trigger();

create or replace function public.notification_appointment_request_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment record;
  v_service record;
  v_clinic record;
  v_event_type text;
  v_metadata jsonb;
begin
  select * into v_appointment from public.appointments where id = new.appointment_id;
  if v_appointment.id is null then
    return new;
  end if;

  select * into v_service from public.services where id = v_appointment.service_id;
  select * into v_clinic from public.clinics where id = v_appointment.clinic_id;

  v_event_type := case
    when new.type = 'reschedule' then 'reschedule_requested_clinic'
    when new.type = 'cancellation' then 'cancellation_requested_clinic'
    else null
  end;

  if v_event_type is null then
    return new;
  end if;

  v_metadata := jsonb_build_object(
    'request_id', new.id,
    'request_type', new.type,
    'service_name', coalesce(v_service.name, v_appointment.reason, 'Turno'),
    'clinic_name', coalesce(v_clinic.name, 'Medin'),
    'appointment_datetime', coalesce(v_appointment.starts_at::text, ''),
    'public_code', v_appointment.public_code,
    'notes', new.notes
  );

  perform public.enqueue_notification_event(
    v_event_type,
    'clinic',
    v_appointment.clinic_id,
    v_appointment.patient_id,
    v_appointment.id,
    null,
    v_metadata
  );

  return new;
exception when others then
  raise notice 'notification_appointment_request_trigger skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notification_appointment_request_after_insert on public.appointment_requests;
create trigger notification_appointment_request_after_insert
  after insert on public.appointment_requests
  for each row execute function public.notification_appointment_request_trigger();

create or replace function public.notification_overbooking_created_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service record;
  v_clinic record;
  v_metadata jsonb;
begin
  if coalesce(new.is_overbooking, false) = false then
    return new;
  end if;

  select * into v_service from public.services where id = new.service_id;
  select * into v_clinic from public.clinics where id = new.clinic_id;

  v_metadata := jsonb_build_object(
    'service_name', coalesce(v_service.name, new.reason, 'Turno'),
    'clinic_name', coalesce(v_clinic.name, 'Medin'),
    'appointment_datetime', coalesce(new.starts_at::text, ''),
    'public_code', new.public_code,
    'overbooking_reason', new.overbooking_reason
  );

  perform public.enqueue_notification_event(
    'overbooking_created_clinic',
    'clinic',
    new.clinic_id,
    new.patient_id,
    new.id,
    null,
    v_metadata
  );

  return new;
exception when others then
  raise notice 'notification_overbooking_created_trigger skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notification_overbooking_created_after_insert on public.appointments;
create trigger notification_overbooking_created_after_insert
  after insert on public.appointments
  for each row execute function public.notification_overbooking_created_trigger();

create or replace function public.notification_plan_change_requested_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic record;
  v_current_plan record;
  v_requested_plan record;
  v_metadata jsonb;
begin
  if new.status is distinct from 'pending' then
    return new;
  end if;

  select * into v_clinic from public.clinics where id = new.clinic_id;
  select * into v_current_plan from public.subscription_plans where id = new.current_plan_id;
  select * into v_requested_plan from public.subscription_plans where id = new.requested_plan_id;

  v_metadata := jsonb_build_object(
    'clinic_name', coalesce(v_clinic.name, 'Clínica'),
    'current_plan', v_current_plan.name,
    'requested_plan', v_requested_plan.name,
    'requested_by', new.requested_by,
    'request_id', new.id
  );

  perform public.enqueue_notification_event(
    'plan_change_requested_platform',
    'platform',
    new.clinic_id,
    null,
    null,
    null,
    v_metadata
  );

  return new;
exception when others then
  raise notice 'notification_plan_change_requested_trigger skipped: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists notification_plan_change_requested_after_insert on public.plan_change_requests;
create trigger notification_plan_change_requested_after_insert
  after insert on public.plan_change_requests
  for each row execute function public.notification_plan_change_requested_trigger();
