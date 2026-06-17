create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  phone text,
  email text,
  address text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  address text,
  phone text
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  last_name text not null,
  email text,
  phone text,
  license_number text,
  bio text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.specialties (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true
);

create table if not exists public.professional_specialties (
  professional_id uuid references public.professionals(id) on delete cascade,
  specialty_id uuid references public.specialties(id) on delete cascade,
  primary key (professional_id, specialty_id)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  specialty_id uuid references public.specialties(id) on delete set null,
  name text not null,
  description text,
  duration_minutes integer not null default 30,
  price numeric(12, 2),
  active boolean not null default true,
  financing_enabled boolean not null default false,
  deposit_required boolean not null default false
);

create table if not exists public.professional_services (
  professional_id uuid references public.professionals(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  primary key (professional_id, service_id)
);

create table if not exists public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes integer not null default 30,
  active boolean not null default true
);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  reason text
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  document_number text,
  insurance text,
  birth_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.appointments
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null,
  add column if not exists professional_id uuid references public.professionals(id) on delete set null,
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists end_time timestamptz,
  add column if not exists source text not null default 'manual',
  add column if not exists notes text,
  add column if not exists whatsapp_status text;

create table if not exists public.booking_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  public_booking_enabled boolean not null default true,
  allow_choose_professional boolean not null default true,
  require_manual_confirmation boolean not null default true,
  min_notice_hours integer not null default 12,
  max_days_ahead integer not null default 45,
  confirmation_message text
);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  type text not null,
  name text not null,
  body text not null,
  active boolean not null default true
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  channel text not null default 'whatsapp',
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled'
);

create index if not exists professionals_clinic_id_idx on public.professionals(clinic_id);
create index if not exists services_clinic_id_idx on public.services(clinic_id);
create index if not exists patients_clinic_id_idx on public.patients(clinic_id);
create index if not exists availability_rules_professional_id_idx on public.availability_rules(professional_id);
create index if not exists reminders_scheduled_at_idx on public.reminders(scheduled_at);
