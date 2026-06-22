alter table public.subscription_plans
  add column if not exists slug text,
  add column if not exists setup_price numeric not null default 0,
  add column if not exists max_services integer,
  add column if not exists max_monthly_appointments integer,
  add column if not exists recommended boolean not null default false,
  add column if not exists custom_pricing boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.subscription_plans set slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g')) where slug is null;
drop index if exists public.subscription_plans_slug_unique_idx;
create unique index if not exists subscription_plans_slug_unique_idx on public.subscription_plans(slug);

alter table public.clinic_subscriptions
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists setup_fee_status text not null default 'pending',
  add column if not exists monthly_fee_status text not null default 'pending';

create table if not exists public.subscription_addons (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, description text, unit_price numeric, currency text not null default 'ARS', unit_label text, active boolean not null default true, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.clinic_subscription_addons (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, subscription_id uuid references public.clinic_subscriptions(id) on delete cascade, addon_id uuid not null references public.subscription_addons(id), quantity integer not null default 1, status text not null default 'active', started_at timestamptz not null default now(), ended_at timestamptz, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.saas_billing_records (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, subscription_id uuid references public.clinic_subscriptions(id) on delete set null, type text not null, amount numeric not null default 0, currency text not null default 'ARS', status text not null default 'pending', due_date date, paid_at timestamptz, payment_method text, external_reference text, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.subscription_usage_snapshots (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, subscription_id uuid references public.clinic_subscriptions(id) on delete cascade, period_start date not null, period_end date not null, professionals_count integer not null default 0, users_count integer not null default 0, locations_count integer not null default 0, patients_count integer not null default 0, services_count integer not null default 0, appointments_count integer not null default 0, messages_count integer not null default 0, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.plan_change_requests (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, current_plan_id uuid references public.subscription_plans(id), requested_plan_id uuid not null references public.subscription_plans(id), requested_by uuid references auth.users(id), status text not null default 'pending', reason text, notes text, created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid references auth.users(id)
);
create index if not exists saas_billing_records_clinic_idx on public.saas_billing_records(clinic_id, status, due_date);
create index if not exists subscription_usage_snapshots_clinic_idx on public.subscription_usage_snapshots(clinic_id, period_end desc);

alter table public.subscription_addons enable row level security;
alter table public.clinic_subscription_addons enable row level security;
alter table public.saas_billing_records enable row level security;
alter table public.subscription_usage_snapshots enable row level security;
alter table public.plan_change_requests enable row level security;

create policy "members can read own subscription addons" on public.clinic_subscription_addons for select using (public.can_access_clinic(clinic_id));
create policy "members can read own saas billing" on public.saas_billing_records for select using (public.can_access_clinic(clinic_id));
create policy "members can read own usage snapshots" on public.subscription_usage_snapshots for select using (public.can_access_clinic(clinic_id));
create policy "members can request plan changes" on public.plan_change_requests for select using (public.can_access_clinic(clinic_id));
create policy "members can insert plan changes" on public.plan_change_requests for insert with check (public.can_access_clinic(clinic_id) and requested_by = auth.uid());
create policy "platform manages subscription addons" on public.clinic_subscription_addons for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform manages saas billing" on public.saas_billing_records for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform manages usage snapshots" on public.subscription_usage_snapshots for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform manages plan requests" on public.plan_change_requests for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "platform manages addons" on public.subscription_addons for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "members read active addons" on public.subscription_addons for select using (active = true);

insert into public.subscription_plans (name, slug, description, monthly_price, setup_price, currency, max_professionals, max_users, max_locations, max_patients, max_services, max_monthly_appointments, included_messages, recommended, custom_pricing, active, metadata)
values
('Free Beta','free-beta','Para clínicas en beta controlada.',0,0,'ARS',1,2,1,100,5,100,0,false,false,true,'{"beta":true}'::jsonb),
('Start','start','Operación clínica inicial.',129000,350000,'ARS',3,3,1,1500,null,null,500,false,false,true,'{}'::jsonb),
('Pro','pro','Operación completa para clínicas en crecimiento.',299000,750000,'ARS',10,8,1,5000,null,null,2500,true,false,true,'{}'::jsonb),
('Clinic','clinic','Para equipos y operación multi-profesional.',599000,1800000,'ARS',30,20,2,20000,null,null,7500,false,false,true,'{}'::jsonb),
('Enterprise','enterprise','Plan a medida para redes y organizaciones.',1200000,3750000,'ARS',null,null,null,null,null,null,null,false,true,true,'{}'::jsonb)
on conflict (slug) do update set name=excluded.name, description=excluded.description, monthly_price=excluded.monthly_price, setup_price=excluded.setup_price, max_professionals=excluded.max_professionals, max_users=excluded.max_users, max_locations=excluded.max_locations, max_patients=excluded.max_patients, max_services=excluded.max_services, max_monthly_appointments=excluded.max_monthly_appointments, included_messages=excluded.included_messages, recommended=excluded.recommended, custom_pricing=excluded.custom_pricing, active=excluded.active, updated_at=now();

insert into public.subscription_addons (key,name,description,unit_price,currency,unit_label,active,metadata) values
('whatsapp_extra','WhatsApp adicional','Capacidad adicional más consumo.',45000,'ARS','por mes',true,'{}'),('extra_location','Sede adicional','Sede adicional por mes.',120000,'ARS','por sede',true,'{}'),('extra_professional','Profesional adicional','Capacidad adicional.',15000,'ARS','por profesional',true,'{}'),('extra_user','Usuario adicional','Usuario adicional.',8000,'ARS','por usuario',true,'{}'),('advanced_reports','Reportes avanzados','Analítica ampliada.',75000,'ARS','por mes',true,'{}'),('payments_module','Pagos y señas','Cobros a pacientes.',60000,'ARS','por mes',true,'{}'),('billing_module','Facturación','Disponible cuando el módulo esté operativo.',90000,'ARS','por mes',false,'{"future":true}'),('prescriptions_module','Recetario','A cotizar.',null,'ARS','a cotizar',false,'{"future":true}'),('clinical_records_module','Historia clínica','A cotizar.',null,'ARS','a cotizar',false,'{"future":true}') on conflict (key) do update set name=excluded.name,description=excluded.description,unit_price=excluded.unit_price,active=excluded.active,metadata=excluded.metadata,updated_at=now();
