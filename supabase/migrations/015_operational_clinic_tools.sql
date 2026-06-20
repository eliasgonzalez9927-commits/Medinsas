alter table public.appointments
  add column if not exists public_code text;

create unique index if not exists appointments_public_code_unique_idx
  on public.appointments(public_code)
  where public_code is not null;

create or replace function public.generate_appointment_public_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'MED-' || lpad((floor(random() * 1000000))::integer::text, 6, '0');
    exit when not exists (select 1 from public.appointments where public_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.assign_appointment_public_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null or btrim(new.public_code) = '' then
    new.public_code := public.generate_appointment_public_code();
  end if;
  return new;
end;
$$;

drop trigger if exists assign_appointment_public_code_before_insert on public.appointments;
create trigger assign_appointment_public_code_before_insert
  before insert on public.appointments
  for each row execute function public.assign_appointment_public_code();

update public.appointments
set public_code = public.generate_appointment_public_code()
where public_code is null or btrim(public_code) = '';

alter table public.message_logs
  add column if not exists payment_id uuid references public.payments(id) on delete set null,
  add column if not exists request_id uuid references public.appointment_requests(id) on delete set null,
  add column if not exists template_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists message_logs_payment_id_idx on public.message_logs(payment_id);
create index if not exists message_logs_request_id_idx on public.message_logs(request_id);
create index if not exists message_logs_template_key_idx on public.message_logs(template_key);

create table if not exists public.health_coverages (
  id uuid primary key default gen_random_uuid(),
  rnas_code text unique,
  rnos_code text,
  name text not null,
  normalized_name text not null,
  type text not null default 'obra_social',
  cuit text,
  address text,
  city text,
  province text,
  phone text,
  toll_free_phone text,
  website text,
  enabled_for_choice boolean not null default true,
  source text not null default 'manual',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists public.health_plans (
  id uuid primary key default gen_random_uuid(),
  coverage_id uuid not null references public.health_coverages(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coverage_id, name)
);

create table if not exists public.clinic_accepted_coverages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  coverage_id uuid not null references public.health_coverages(id) on delete cascade,
  accepted boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, coverage_id)
);

create table if not exists public.patient_coverages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  coverage_id uuid not null references public.health_coverages(id) on delete restrict,
  plan_id uuid references public.health_plans(id) on delete set null,
  affiliate_number text,
  holder_name text,
  holder_dni text,
  relationship text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_coverages_search_idx on public.health_coverages(normalized_name);
create index if not exists health_plans_coverage_idx on public.health_plans(coverage_id);
create index if not exists clinic_accepted_coverages_clinic_idx on public.clinic_accepted_coverages(clinic_id);
create index if not exists patient_coverages_patient_idx on public.patient_coverages(patient_id);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  type text not null,
  filename text,
  status text not null default 'pending',
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.import_job_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  status text not null default 'pending',
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  error text,
  created_entity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists import_jobs_clinic_created_idx on public.import_jobs(clinic_id, created_at desc);
create index if not exists import_job_rows_job_idx on public.import_job_rows(import_job_id);

alter table public.booking_settings
  add column if not exists ask_health_coverage boolean not null default false;

alter table public.health_coverages enable row level security;
alter table public.health_plans enable row level security;
alter table public.clinic_accepted_coverages enable row level security;
alter table public.patient_coverages enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_job_rows enable row level security;

drop policy if exists "staff can read health coverages" on public.health_coverages;
create policy "staff can read health coverages"
  on public.health_coverages for select
  using (public.is_admin());

drop policy if exists "admins can manage health coverages" on public.health_coverages;
create policy "admins can manage health coverages"
  on public.health_coverages for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage health plans" on public.health_plans;
create policy "admins can manage health plans"
  on public.health_plans for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "members can manage clinic accepted coverages" on public.clinic_accepted_coverages;
create policy "members can manage clinic accepted coverages"
  on public.clinic_accepted_coverages for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

drop policy if exists "admins can manage patient coverages" on public.patient_coverages;
create policy "admins can manage patient coverages"
  on public.patient_coverages for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "members can manage import jobs" on public.import_jobs;
create policy "members can manage import jobs"
  on public.import_jobs for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

drop policy if exists "members can manage import job rows" on public.import_job_rows;
create policy "members can manage import job rows"
  on public.import_job_rows for all
  using (
    exists (select 1 from public.import_jobs ij where ij.id = import_job_id and public.can_access_clinic(ij.clinic_id))
  )
  with check (
    exists (select 1 from public.import_jobs ij where ij.id = import_job_id and public.can_access_clinic(ij.clinic_id))
  );
