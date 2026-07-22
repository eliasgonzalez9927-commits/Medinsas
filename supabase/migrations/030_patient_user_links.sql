-- Base model for authenticated patient access.
-- This migration only creates the link table and integrity guards.
-- Patient-facing read/write policies for patients and appointments are added in migration 042.
--
-- Written back in an earlier session but never actually run against Supabase
-- until 2026-07-22 (found while wiring the patient portal to real data).

create table if not exists public.patient_user_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  relationship text not null,
  status text not null default 'invited',
  created_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  alter table public.patient_user_links
    add constraint patient_user_links_relationship_check
    check (relationship in ('self', 'guardian', 'family_member'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patient_user_links
    add constraint patient_user_links_status_check
    check (status in ('invited', 'active', 'revoked'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists patient_user_links_active_identity_unique_idx
  on public.patient_user_links(user_id, clinic_id, patient_id)
  where status <> 'revoked';

create index if not exists patient_user_links_user_id_idx
  on public.patient_user_links(user_id);

create index if not exists patient_user_links_clinic_id_idx
  on public.patient_user_links(clinic_id);

create index if not exists patient_user_links_patient_id_idx
  on public.patient_user_links(patient_id);

create index if not exists patient_user_links_status_idx
  on public.patient_user_links(status);

create index if not exists patient_user_links_user_status_idx
  on public.patient_user_links(user_id, status);

create index if not exists patient_user_links_clinic_patient_idx
  on public.patient_user_links(clinic_id, patient_id);

create or replace function public.validate_patient_user_link_clinic()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_patient_clinic_id uuid;
begin
  select p.clinic_id
    into v_patient_clinic_id
  from public.patients p
  where p.id = new.patient_id;

  if v_patient_clinic_id is null then
    raise exception 'PATIENT_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;

  if v_patient_clinic_id <> new.clinic_id then
    raise exception 'PATIENT_CLINIC_MISMATCH'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_patient_user_link_clinic_trigger on public.patient_user_links;

create trigger validate_patient_user_link_clinic_trigger
  before insert or update of clinic_id, patient_id
  on public.patient_user_links
  for each row
  execute function public.validate_patient_user_link_clinic();

create or replace function public.set_patient_user_links_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_patient_user_links_updated_at_trigger on public.patient_user_links;

create trigger set_patient_user_links_updated_at_trigger
  before update
  on public.patient_user_links
  for each row
  execute function public.set_patient_user_links_updated_at();

alter table public.patient_user_links enable row level security;

comment on table public.patient_user_links is
  'Links authenticated users to real operational patients inside a clinic.';
comment on column public.patient_user_links.user_id is
  'Authenticated Supabase user that can access one or more linked patient records.';
comment on column public.patient_user_links.patient_id is
  'Operational patient record from public.patients. The validation trigger enforces the same clinic_id.';
comment on column public.patient_user_links.relationship is
  'Allowed values: self, guardian, family_member.';
comment on column public.patient_user_links.status is
  'Allowed values: invited, active, revoked. Only one non-revoked link per (user_id, clinic_id, patient_id) is allowed. Revoked links are excluded from the uniqueness guard and kept as history.';
