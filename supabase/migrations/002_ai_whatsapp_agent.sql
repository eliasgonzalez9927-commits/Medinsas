alter type public.user_role add value if not exists 'doctor';
alter type public.appointment_status add value if not exists 'no_show';

alter table public.appointments
  add column if not exists specialty text;

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.profiles(id) on delete set null,
  summary text not null,
  diagnosis text,
  allergies text,
  medications text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treatment_payments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.profiles(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  treatment_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_message_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider_message_id text not null,
  from_phone text,
  to_phone text,
  status text not null,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_message_id)
);

create index if not exists medical_records_patient_id_idx
  on public.medical_records(patient_id);

create index if not exists treatment_payments_paid_at_idx
  on public.treatment_payments(paid_at);

create index if not exists ai_message_logs_created_at_idx
  on public.ai_message_logs(created_at);
