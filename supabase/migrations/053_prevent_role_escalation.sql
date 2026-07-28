-- Bug real reportado en vivo (2026-07-28): desde "Invitar usuario" /
-- "Editar usuario" en la configuracion de una clinica se podia elegir el
-- rol "platform_admin" (Superadmin, acceso a TODAS las clinicas) - un
-- clinic_admin comun podia auto-otorgarse o darle a cualquiera acceso
-- total a la plataforma. Se saco la opcion de la UI (ver commit del
-- frontend), pero eso solo cierra la puerta de entrada - el problema de
-- fondo sigue existiendo mas abajo:
--
-- 1) "users can update own profile" (migracion 006) permite a CUALQUIER
--    usuario logueado hacer update sobre su propia fila de profiles sin
--    ninguna restriccion de columna - literalmente
--    supabase.from('profiles').update({role:'platform_admin'}).eq('id', miId)
--    funcionaba para cualquiera, no solo para el flujo de invitaciones.
-- 2) accept_user_invitation (migracion 037) copia el role de la
--    invitacion a clinic_members sin validar nada - una invitacion con
--    role='platform_admin' (creada a mano contra la tabla, sin pasar por
--    la UI) hubiera otorgado ese rol igual.
--
-- Este fix es a nivel de base de datos a proposito: no depende de que la
-- UI se porte bien, bloquea el escalamiento sin importar por donde se
-- intente (fetch directo, invitacion manipulada, futura pantalla nueva
-- que se olvide de este chequeo).

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'platform_admin'
  );
$$;

-- auth.uid() is not null descarta llamadas hechas con la service role key
-- (backend de confianza, ej. api/superadmin/.../users.js, que ya excluye
-- platform_admin de ALLOWED_ROLES de todos modos) - solo interviene sobre
-- sesiones reales de usuario final.
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and not public.is_platform_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_role_escalation_trigger on public.profiles;
create trigger prevent_profile_role_escalation_trigger
  before update on public.profiles
  for each row execute procedure public.prevent_profile_role_escalation();

-- Cubre tanto el insert directo como el "on conflict do update" que usa
-- accept_user_invitation (Postgres dispara el trigger de insert o el de
-- update segun cual de las dos ramas del upsert termine ejecutandose).
create or replace function public.prevent_clinic_member_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role::text = 'platform_admin'
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'FORBIDDEN: solo un platform_admin puede otorgar el rol platform_admin' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_clinic_member_role_escalation_trigger on public.clinic_members;
create trigger prevent_clinic_member_role_escalation_trigger
  before insert or update on public.clinic_members
  for each row execute procedure public.prevent_clinic_member_role_escalation();
