-- WhatsApp Business Platform directo con Meta (sin BSP intermediario - el
-- fee fijo por clinica de un BSP no cierra contra el precio de los planes
-- de Medin). Cada clinica conecta su propio numero via Embedded Signup;
-- clinic_notification_settings.whatsapp_enabled/whatsapp_phone_number ya
-- existian (migracion 020) pero eran solo para mostrar un numero de
-- contacto, no la cuenta real que envia los mensajes - eso vive aca.
create table if not exists public.whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  access_token_encrypted text,
  status text not null default 'disconnected',
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id)
);

-- El contenido de las plantillas lo define Medin (confirmacion de turno,
-- recordatorio 24h, recordatorio 2h) pero cada WABA de cada clinica
-- necesita su propia aprobacion de Meta - por eso el tracking es por
-- clinica aunque el texto sea el mismo para todas.
create table if not exists public.whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  template_key text not null,
  meta_template_name text,
  meta_template_id text,
  language_code text not null default 'es_AR',
  category text not null default 'utility',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, template_key)
);

-- Evita mandar el mismo recordatorio dos veces si el cron corre mas
-- seguido que la ventana de 24h/2h que intenta cubrir.
alter table public.appointments
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_2h_sent_at timestamptz;

create index if not exists whatsapp_settings_clinic_id_idx on public.whatsapp_settings(clinic_id);
create index if not exists whatsapp_message_templates_clinic_id_idx on public.whatsapp_message_templates(clinic_id);

-- El webhook de Meta busca la delivery por provider_message_id para
-- actualizar su estado (entregado/leido/fallido) - sin este indice es un
-- seq scan sobre notification_deliveries en cada evento de estado.
create index if not exists notification_deliveries_provider_message_id_idx
  on public.notification_deliveries(provider_message_id);

-- Los dos recordatorios que arma el cron de la Parte F son event_type
-- nuevos para enqueue_notification_event() - sin fila en notification_templates
-- el titulo cae al event_type crudo (igual funciona, pero queda feo en la
-- campanita in-app).
insert into public.notification_templates (key, channel, audience, title, body, active, metadata)
values
  ('appointment_reminder_24h', 'in_app', 'patient', 'Recordatorio de turno', 'Te recordamos tu turno de {{service_name}} manana {{appointment_datetime}}.', true, '{}'::jsonb),
  ('appointment_reminder_2h', 'in_app', 'patient', 'Tu turno es hoy', 'Tu turno de {{service_name}} es hoy {{appointment_datetime}}.', true, '{}'::jsonb)
on conflict (key) do update
set channel = excluded.channel,
    audience = excluded.audience,
    title = excluded.title,
    body = excluded.body,
    active = excluded.active;

alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_message_templates enable row level security;

drop policy if exists "admins can manage whatsapp settings" on public.whatsapp_settings;
create policy "admins can manage whatsapp settings"
  on public.whatsapp_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage whatsapp templates status" on public.whatsapp_message_templates;
create policy "admins can manage whatsapp templates status"
  on public.whatsapp_message_templates for all
  using (public.is_admin())
  with check (public.is_admin());
