do $$
begin
  create type public.user_role as enum (
    'patient',
    'admin',
    'platform_admin',
    'clinic_admin',
    'receptionist',
    'professional'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.user_role add value if not exists 'platform_admin';
alter type public.user_role add value if not exists 'clinic_admin';
alter type public.user_role add value if not exists 'receptionist';
alter type public.user_role add value if not exists 'professional';

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Usuario sin nombre',
  phone text,
  role public.user_role not null default 'patient',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists full_name text not null default 'Usuario sin nombre',
  add column if not exists phone text,
  add column if not exists role public.user_role not null default 'patient',
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.user_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);

create index if not exists clinic_members_user_id_idx on public.clinic_members(user_id);
create index if not exists clinic_members_clinic_id_idx on public.clinic_members(clinic_id);
create index if not exists clinic_members_role_idx on public.clinic_members(role);

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
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

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
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text in ('platform_admin', 'clinic_admin', 'receptionist', 'professional', 'admin')
  )
  or exists (
    select 1
    from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.active = true
      and cm.role::text in ('platform_admin', 'clinic_admin', 'receptionist', 'professional', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.clinic_members enable row level security;

drop policy if exists "users can read own profile" on public.profiles;
drop policy if exists "base users can read own profile" on public.profiles;
create policy "users can read own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "users can update own profile" on public.profiles;
drop policy if exists "base users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "admins can manage profiles" on public.profiles;
create policy "admins can manage profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "members can read own clinic memberships" on public.clinic_members;
create policy "members can read own clinic memberships"
  on public.clinic_members for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "admins can manage clinic memberships" on public.clinic_members;
create policy "admins can manage clinic memberships"
  on public.clinic_members for all
  using (public.is_admin())
  with check (public.is_admin());
