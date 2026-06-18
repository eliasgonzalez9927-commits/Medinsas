create table if not exists public.payment_settings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null default 'mercado_pago',
  active boolean not null default false,
  mode text not null default 'sandbox',
  public_key text,
  access_token_encrypted text,
  webhook_secret text,
  default_currency text not null default 'ARS',
  checkout_public_name text,
  collect_deposit_online boolean not null default false,
  deposit_type text not null default 'fixed',
  deposit_amount numeric(12, 2),
  deposit_percentage numeric(5, 2),
  payment_link_expiration_minutes integer,
  support_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, provider)
);

alter table public.payments
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists provider text not null default 'manual',
  add column if not exists provider_payment_id text,
  add column if not exists provider_preference_id text,
  add column if not exists external_reference text,
  add column if not exists status_detail text,
  add column if not exists payment_method text,
  add column if not exists payer_email text,
  add column if not exists checkout_url text;

alter table public.appointments
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists deposit_amount numeric(12, 2),
  add column if not exists payment_required boolean not null default false;

alter table public.services
  add column if not exists payment_required boolean not null default false,
  add column if not exists deposit_required boolean not null default false,
  add column if not exists deposit_amount numeric(12, 2),
  add column if not exists allow_online_payment boolean not null default true;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null default 'mercado_pago',
  event_type text not null,
  provider_event_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists payment_settings_clinic_provider_idx on public.payment_settings(clinic_id, provider);
create index if not exists payments_invoice_id_idx on public.payments(invoice_id);
create index if not exists payments_service_id_idx on public.payments(service_id);
create index if not exists payments_provider_payment_id_idx on public.payments(provider, provider_payment_id);
create index if not exists payments_provider_preference_id_idx on public.payments(provider, provider_preference_id);
create index if not exists payments_external_reference_idx on public.payments(external_reference);
create index if not exists appointments_payment_status_idx on public.appointments(payment_status);
create index if not exists payment_events_payment_id_idx on public.payment_events(payment_id);
create index if not exists payment_events_clinic_id_idx on public.payment_events(clinic_id);
create index if not exists payment_events_provider_event_id_idx on public.payment_events(provider, provider_event_id);

alter table public.payment_settings enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "admins can manage payment settings" on public.payment_settings;
create policy "admins can manage payment settings"
  on public.payment_settings for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can manage payment events" on public.payment_events;
create policy "admins can manage payment events"
  on public.payment_events for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.payment_settings (
  clinic_id,
  provider,
  active,
  mode,
  default_currency,
  checkout_public_name,
  collect_deposit_online,
  deposit_type,
  deposit_amount,
  support_email
)
select
  c.id,
  'mercado_pago',
  false,
  'sandbox',
  'ARS',
  c.name,
  false,
  'fixed',
  null,
  c.email
from public.clinics c
where c.slug = 'clinica-central'
on conflict (clinic_id, provider) do nothing;
