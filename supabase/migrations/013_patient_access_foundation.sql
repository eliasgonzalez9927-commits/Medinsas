create table if not exists public.appointment_public_links (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  type text not null,
  status text not null default 'pending',
  requested_by text not null default 'patient',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists appointment_public_links_appointment_id_idx
  on public.appointment_public_links(appointment_id);

create index if not exists appointment_public_links_token_idx
  on public.appointment_public_links(token);

create index if not exists appointment_requests_appointment_id_idx
  on public.appointment_requests(appointment_id);

create index if not exists appointment_requests_status_idx
  on public.appointment_requests(status);

do $$
begin
  alter table public.appointment_requests
    add constraint appointment_requests_type_check
    check (type in ('cancellation', 'reschedule'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.appointment_requests
    add constraint appointment_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.appointment_requests
    add constraint appointment_requests_requested_by_check
    check (requested_by in ('patient', 'clinic', 'system'));
exception when duplicate_object then null;
end $$;

alter table public.appointment_public_links enable row level security;
alter table public.appointment_requests enable row level security;

drop policy if exists "admins can manage appointment public links" on public.appointment_public_links;
create policy "admins can manage appointment public links"
  on public.appointment_public_links for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage appointment requests" on public.appointment_requests;
create policy "admins can manage appointment requests"
  on public.appointment_requests for all
  using (public.is_admin())
  with check (public.is_admin());
