alter table public.clinics
  add column if not exists plan text not null default 'basico',
  add column if not exists status text not null default 'active',
  add column if not exists legal_name text,
  add column if not exists cuit text,
  add column if not exists whatsapp text,
  add column if not exists active boolean not null default true,
  add column if not exists timezone text not null default 'America/Argentina/Mendoza',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  monthly_price numeric(12, 2) not null default 0,
  currency text not null default 'ARS',
  max_users integer,
  max_locations integer,
  max_professionals integer,
  max_patients integer,
  included_messages integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null default 'trial',
  billing_cycle text not null default 'monthly',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  suspended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id)
);

create table if not exists public.clinic_modules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, module_key)
);

create table if not exists public.clinic_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  step_key text not null,
  status text not null default 'pending',
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, step_key)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists clinic_subscriptions_status_idx on public.clinic_subscriptions(status);
create index if not exists clinic_modules_clinic_key_idx on public.clinic_modules(clinic_id, module_key);
create index if not exists clinic_onboarding_steps_clinic_idx on public.clinic_onboarding_steps(clinic_id);
create index if not exists audit_logs_clinic_created_idx on public.audit_logs(clinic_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs(action);

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'platform_admin'
  )
  or exists (
    select 1
    from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.active = true
      and cm.role::text = 'platform_admin'
  );
$$;

create or replace function public.can_access_clinic(p_clinic_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.active = true
      and cm.clinic_id = p_clinic_id
  );
$$;

alter table public.subscription_plans enable row level security;
alter table public.clinic_subscriptions enable row level security;
alter table public.clinic_modules enable row level security;
alter table public.clinic_onboarding_steps enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "admins can manage subscription plans" on public.subscription_plans;
create policy "admins can read subscription plans"
  on public.subscription_plans for select
  using (public.is_admin());

drop policy if exists "platform admins can manage subscription plans" on public.subscription_plans;
create policy "platform admins can manage subscription plans"
  on public.subscription_plans for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "admins can manage clinic subscriptions" on public.clinic_subscriptions;
create policy "members can read own clinic subscriptions"
  on public.clinic_subscriptions for select
  using (public.can_access_clinic(clinic_id));

drop policy if exists "platform admins can manage clinic subscriptions" on public.clinic_subscriptions;
create policy "platform admins can manage clinic subscriptions"
  on public.clinic_subscriptions for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "admins can manage clinic modules" on public.clinic_modules;
create policy "members can read own clinic modules"
  on public.clinic_modules for select
  using (public.can_access_clinic(clinic_id));

drop policy if exists "platform admins can manage clinic modules" on public.clinic_modules;
create policy "platform admins can manage clinic modules"
  on public.clinic_modules for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "admins can manage onboarding steps" on public.clinic_onboarding_steps;
create policy "members can read own onboarding steps"
  on public.clinic_onboarding_steps for select
  using (public.can_access_clinic(clinic_id));

drop policy if exists "platform admins can manage onboarding steps" on public.clinic_onboarding_steps;
create policy "platform admins can manage onboarding steps"
  on public.clinic_onboarding_steps for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "admins can read audit logs" on public.audit_logs;
create policy "platform admins can read audit logs"
  on public.audit_logs for select
  using (public.is_platform_admin());

drop policy if exists "admins can insert audit logs" on public.audit_logs;
create policy "platform admins can insert audit logs"
  on public.audit_logs for insert
  with check (public.is_platform_admin());

insert into public.subscription_plans (name, description, monthly_price, currency, max_users, max_locations, max_professionals, max_patients, included_messages, active)
values
  ('Básico', 'Agenda, pacientes, profesionales, servicios y reserva online para una clínica chica.', 49000, 'ARS', 5, 1, 5, null, 500, true),
  ('Pro', 'Operación completa con pagos, mensajes, reportes y módulos avanzados preparados.', 99000, 'ARS', 20, 3, 25, null, 2500, true),
  ('Enterprise', 'Plan a medida para redes, múltiples sedes y requerimientos avanzados.', 0, 'ARS', null, null, null, null, null, true)
on conflict (name) do update
set description = excluded.description,
    monthly_price = excluded.monthly_price,
    currency = excluded.currency,
    max_users = excluded.max_users,
    max_locations = excluded.max_locations,
    max_professionals = excluded.max_professionals,
    max_patients = excluded.max_patients,
    included_messages = excluded.included_messages,
    active = excluded.active,
    updated_at = now();

insert into public.clinic_modules (clinic_id, module_key, enabled)
select c.id, module_key, true
from public.clinics c
cross join (
  values
    ('agenda'),
    ('pacientes'),
    ('profesionales'),
    ('servicios'),
    ('disponibilidad'),
    ('reservas_online'),
    ('mensajes'),
    ('whatsapp'),
    ('pagos'),
    ('mercado_pago'),
    ('financiacion'),
    ('facturacion'),
    ('recetarios'),
    ('historia_clinica'),
    ('obras_sociales'),
    ('importaciones'),
    ('reportes')
) as modules(module_key)
on conflict (clinic_id, module_key) do nothing;

insert into public.clinic_subscriptions (clinic_id, plan_id, status, billing_cycle, trial_ends_at)
select c.id, sp.id, 'trial', 'monthly', now() + interval '14 days'
from public.clinics c
left join public.subscription_plans sp on sp.name = 'Pro'
on conflict (clinic_id) do nothing;

insert into public.clinic_onboarding_steps (clinic_id, step_key, status)
select c.id, step_key, 'pending'
from public.clinics c
cross join (
  values
    ('clinic_data'),
    ('locations'),
    ('users'),
    ('professionals'),
    ('services'),
    ('availability'),
    ('online_booking'),
    ('payments'),
    ('finish')
) as steps(step_key)
on conflict (clinic_id, step_key) do nothing;
