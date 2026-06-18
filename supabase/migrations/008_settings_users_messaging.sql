alter table public.clinics
  add column if not exists legal_name text,
  add column if not exists whatsapp text,
  add column if not exists website_url text,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.locations
  add column if not exists active boolean not null default true,
  add column if not exists is_primary boolean not null default false,
  add column if not exists business_hours jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.patients
  add column if not exists email_opt_in boolean not null default true,
  add column if not exists whatsapp_opt_in boolean not null default true,
  add column if not exists communication_notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.clinic_members
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists professional_id uuid references public.professionals(id) on delete set null,
  add column if not exists invitation_status text not null default 'active';

alter table public.booking_settings
  add column if not exists email_on_booking_request boolean not null default true,
  add column if not exists email_on_confirmation boolean not null default true,
  add column if not exists email_on_cancellation boolean not null default true,
  add column if not exists email_reminder_enabled boolean not null default false,
  add column if not exists whatsapp_future_enabled boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.clinic_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  opens_at time,
  closes_at time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, day_of_week)
);

create table if not exists public.clinic_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null,
  location_id uuid references public.locations(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  status text not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  invitation_token text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  channel text not null default 'email',
  type text not null,
  name text not null,
  subject text,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, channel, type)
);

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  channel text not null default 'email',
  provider text not null default 'resend',
  recipient text not null,
  subject text,
  body_preview text,
  status text not null default 'pending',
  provider_message_id text,
  error_message text,
  related_entity_type text,
  related_entity_id uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists clinic_hours_clinic_id_idx on public.clinic_hours(clinic_id);
create index if not exists clinic_schedule_exceptions_clinic_id_idx on public.clinic_schedule_exceptions(clinic_id);
create index if not exists user_invitations_clinic_id_idx on public.user_invitations(clinic_id);
create index if not exists user_invitations_email_idx on public.user_invitations(lower(email));
create index if not exists message_templates_clinic_type_idx on public.message_templates(clinic_id, type);
create index if not exists message_logs_clinic_id_idx on public.message_logs(clinic_id);
create index if not exists message_logs_patient_id_idx on public.message_logs(patient_id);
create index if not exists message_logs_created_at_idx on public.message_logs(created_at desc);

alter table public.clinic_hours enable row level security;
alter table public.clinic_schedule_exceptions enable row level security;
alter table public.user_invitations enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_logs enable row level security;

drop policy if exists "admins can manage clinic hours" on public.clinic_hours;
create policy "admins can manage clinic hours"
  on public.clinic_hours for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage clinic schedule exceptions" on public.clinic_schedule_exceptions;
create policy "admins can manage clinic schedule exceptions"
  on public.clinic_schedule_exceptions for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage user invitations" on public.user_invitations;
create policy "admins can manage user invitations"
  on public.user_invitations for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage message templates" on public.message_templates;
create policy "admins can manage message templates"
  on public.message_templates for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage message logs" on public.message_logs;
create policy "admins can manage message logs"
  on public.message_logs for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.clinic_hours (clinic_id, day_of_week, is_open, opens_at, closes_at, notes)
select c.id, day_value, day_value between 1 and 6,
  case when day_value between 1 and 5 then '08:00'::time when day_value = 6 then '09:00'::time else null end,
  case when day_value between 1 and 5 then '20:00'::time when day_value = 6 then '13:00'::time else null end,
  case when day_value = 0 then 'Cerrado' else null end
from public.clinics c
cross join generate_series(0, 6) as day_value
where c.slug = 'clinica-central'
on conflict (clinic_id, day_of_week) do nothing;

insert into public.message_templates (clinic_id, channel, type, name, subject, body)
select c.id, 'email', template_type, template_name, template_subject, template_body
from public.clinics c
cross join (
  values
    ('appointment_created', 'Turno creado manualmente', 'Tu turno fue registrado', 'Hola {{patient_name}}, tu turno fue registrado para {{appointment_date}}.'),
    ('appointment_requested', 'Turno solicitado online', 'Recibimos tu solicitud de turno', 'Hola {{patient_name}}, recibimos tu solicitud de turno. Te contactaremos para confirmarla.'),
    ('appointment_confirmed', 'Turno confirmado', 'Tu turno fue confirmado', 'Hola {{patient_name}}, tu turno fue confirmado para {{appointment_date}}.'),
    ('appointment_cancelled', 'Turno cancelado', 'Tu turno fue cancelado', 'Hola {{patient_name}}, tu turno fue cancelado. Si necesitas reprogramar, contactanos.'),
    ('appointment_reminder', 'Recordatorio de turno', 'Recordatorio de turno', 'Hola {{patient_name}}, te recordamos tu turno para {{appointment_date}}.'),
    ('patient_message', 'Mensaje general a pacientes', null, '{{message_body}}'),
    ('user_invitation', 'Invitacion a usuario', 'Te invitaron a Medin', 'Hola {{full_name}}, te invitaron a Medin como {{role}}.')
) as templates(template_type, template_name, template_subject, template_body)
where c.slug = 'clinica-central'
on conflict (clinic_id, channel, type) do update
set name = excluded.name,
    subject = coalesce(public.message_templates.subject, excluded.subject),
    body = coalesce(public.message_templates.body, excluded.body),
    updated_at = now();
