-- Cierra dos formas de auto-asignarse platform_admin (o cualquier rol) sin
-- pasar por ningun admin real.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.
--
-- Hueco 1: handle_new_user() (migracion 006) confiaba en el campo "role"
-- que manda el propio cliente al registrarse (raw_user_meta_data). Las
-- pantallas de registro de la app siempre mandan role: "patient", pero
-- eso es solo la UI - cualquiera puede llamar directo a
-- supabase.auth.signUp() con role: "platform_admin" en el metadata desde
-- la consola del navegador (la url y la key publica ya estan expuestas
-- en el bundle). Se confirmo que scripts/create-admin.mjs (la via
-- legitima para crear admins) NO depende de este trigger para fijar el
-- rol - pisa profiles.role explicitamente despues, con la service role
-- key. Por eso ignorar el metadata acá es seguro.
-- Fix: el trigger ahora siempre inserta role = 'patient', sin importar
-- lo que mande el cliente.
--
-- Hueco 2 (mas directo): la policy "users can update own profile"
-- (migracion 006) permite UPDATE en profiles donde auth.uid() = id, sin
-- restringir que columnas se pueden cambiar. Cualquier usuario ya
-- logueado (un paciente comun, por ejemplo) puede hacer
-- supabase.from('profiles').update({ role: 'platform_admin' }) sobre su
-- propia fila y quedar con acceso de admin en toda la app, porque
-- is_admin() (que protege casi todas las policies) chequea profiles.role
-- directamente. No se puede resolver esto solo con la policy de RLS
-- (WITH CHECK no tiene forma de comparar contra el valor anterior de la
-- fila), asi que se agrega un trigger BEFORE UPDATE que revierte
-- cualquier cambio de role hecho por alguien que no sea admin real.
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
    'patient'
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone;
  return new;
end;
$$;

create or replace function public.prevent_profile_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_role_self_escalation on public.profiles;
create trigger prevent_profile_role_self_escalation
  before update on public.profiles
  for each row
  execute function public.prevent_profile_role_self_escalation();
