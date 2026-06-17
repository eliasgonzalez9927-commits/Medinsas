create extension if not exists "pgcrypto";

create type public.user_role as enum ('patient', 'admin');
create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'attended',
  'completed',
  'cancelled',
  'rescheduled',
  'no_show',
  'urgent'
);
create type public.appointment_type as enum ('in_person', 'telemedicine');
create type public.urgency_level as enum ('low', 'medium', 'high');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role public.user_role not null default 'patient',
  created_at timestamptz not null default now()
);

create table public.triage_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  symptoms text not null,
  urgency_level public.urgency_level not null,
  has_fever boolean not null default false,
  has_breathing_difficulty boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  triage_result_id uuid references public.triage_results(id) on delete set null,
  starts_at timestamptz not null,
  appointment_type public.appointment_type not null,
  status public.appointment_status not null default 'pending',
  reason text not null,
  specialty text,
  created_at timestamptz not null default now(),
  constraint appointments_unique_slot unique (starts_at, appointment_type)
);

create index appointments_starts_at_idx on public.appointments(starts_at);
create index appointments_patient_id_idx on public.appointments(patient_id);
create index triage_results_patient_id_idx on public.triage_results(patient_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Usuario sin nombre'),
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'patient')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.triage_results enable row level security;
alter table public.appointments enable row level security;

create policy "profiles can read own profile"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles can update own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "admins can read all triage results"
  on public.triage_results for select
  using (public.is_admin());

create policy "patients can read own triage results"
  on public.triage_results for select
  using (patient_id = auth.uid());

create policy "patients can insert own triage results"
  on public.triage_results for insert
  with check (patient_id = auth.uid());

create policy "admins can read all appointments"
  on public.appointments for select
  using (public.is_admin());

create policy "patients can read own appointments"
  on public.appointments for select
  using (patient_id = auth.uid());

create policy "patients can create own appointments"
  on public.appointments for insert
  with check (patient_id = auth.uid());

create policy "admins can update appointment status"
  on public.appointments for update
  using (public.is_admin())
  with check (public.is_admin());
