-- 021_clinic_scoped_rls_isolation.sql
--
-- OBJETIVO
-- Corregir un bug critico de aislamiento multi-tenant: la funcion is_admin()
-- usada en las policies de patients, appointments, payments, professionals,
-- services, clinic_members, message_logs, booking_settings y profiles
-- verifica unicamente el ROL del usuario (platform_admin/clinic_admin/
-- receptionist/professional/admin) sin comparar clinic_id. Esto permite que
-- un admin/recepcionista/profesional de la Clinica A lea y escriba datos de
-- CUALQUIER otra clinica.
--
-- Esta migracion reemplaza is_admin() por can_access_clinic(clinic_id) en
-- las tablas que tienen columna clinic_id (ya existe, ya esta bien
-- implementada: ver migracion 013_patient_access_foundation.sql, valida
-- is_platform_admin() OR clinic_members.clinic_id = p_clinic_id AND active),
-- y por is_platform_admin() en profiles, que no tiene clinic_id.
--
-- can_access_clinic(p_clinic_id) NO filtra por rol dentro de la clinica: la
-- cumple cualquier fila activa en clinic_members sin importar si el rol es
-- clinic_admin, receptionist o professional. Esto es intencional para esta
-- migracion: el objetivo de HOY es exclusivamente cerrar el cruce ENTRE
-- clinicas, sin tocar los permisos POR ROL dentro de la propia clinica
-- (esos se documentan como deuda conocida, no se tocan aqui salvo
-- clinic_members, ver punto 7 abajo).
--
-- NO incluye: cambios a la tabla clinics (lectura publica de columnas
-- sensibles), cambios a services/professionals/booking_settings de lectura
-- publica, ni cambios al frontend. Esos quedan documentados como Fase 2,
-- porque requieren tocar codigo de /reservar/:slug y se evaluan con su
-- propio plan de pruebas.
--
-- ALCANCE DE ESTA MIGRACION (Fase 1 - critica):
--   1) patients            ALL    is_admin() -> can_access_clinic(clinic_id)
--   2) appointments        ALL    is_admin() -> can_access_clinic(clinic_id)
--                          (colapsa 2 policies duplicadas en 1)
--   3) payments            ALL    is_admin() -> can_access_clinic(clinic_id)
--      DEUDA CONOCIDA (no se corrige aqui): el matriz de permisos de la app
--      (src/lib/permissions.ts, backend/src/security/permissions.js) ya le
--      da canManageBilling=true a receptionist y canManageBilling=false a
--      professional, pero a nivel de base de datos cualquier rol activo
--      (incluido professional) puede escribir payments hoy, antes y despues
--      de esta migracion. No se restringe aca para no mezclar el fix de
--      aislamiento entre clinicas con un cambio de permisos por rol; queda
--      como tarea de seguimiento explicita.
--   4) professionals       ALL    is_admin() -> can_access_clinic(clinic_id)
--      DEUDA CONOCIDA: mismo caso que payments. canManageClinic=false para
--      receptionist/professional en la app, pero la DB permite escribir.
--      Se mantiene intacta la policy publica de solo lectura.
--   5) services            ALL    is_admin() -> can_access_clinic(clinic_id)
--      DEUDA CONOCIDA: igual a professionals. Se mantiene intacta la
--      policy publica de solo lectura.
--   6) booking_settings    ALL    is_admin() -> can_access_clinic(clinic_id)
--      DEUDA CONOCIDA: igual a professionals. Se mantiene intacta la
--      policy publica de solo lectura.
--   7) clinic_members      Unica tabla donde SI se restringe por rol en esta
--      misma migracion, porque crear/editar/borrar miembros de clinica
--      (incluido asignar el rol clinic_admin a alguien) es sensible y el
--      pedido explicito fue que receptionist/professional NO puedan hacerlo:
--        - nueva funcion can_manage_clinic_members(p_clinic_id): true para
--          is_platform_admin() o para miembro activo con role en
--          ('clinic_admin','admin').
--        - policy de ALL (insert/update/delete/select) usa
--          can_manage_clinic_members(clinic_id) en lugar de is_admin().
--        - policy adicional de SELECT (solo lectura) usa
--          can_access_clinic(clinic_id) para que cualquier staff activo
--          (incluye receptionist/professional) pueda ver el listado de su
--          propio equipo (lo necesita getClinicMembers en
--          src/lib/clinic-data.ts para la pantalla de Usuarios), pero NO
--          pueda crear/editar/borrar miembros.
--        - en Postgres RLS, cuando hay varias policies permisivas para el
--          mismo comando se combinan con OR; como la policy de "manage" es
--          FOR ALL y la de "read roster" es FOR SELECT, en INSERT/UPDATE/
--          DELETE solo aplica can_manage_clinic_members (mas restrictivo),
--          y en SELECT aplican ambas (OR), permitiendo el listado a todo
--          el staff activo.
--   8) message_logs        ALL    is_admin() -> can_access_clinic(clinic_id)
--   9) profiles            ALL    is_admin() -> is_platform_admin()
--                          (editar/borrar perfiles de OTROS usuarios queda
--                          solo para platform_admin; confirmado por grep que
--                          ningun flujo de frontend edita el profile de un
--                          tercero, solo lee nombre/telefono/rol para
--                          mostrar el equipo de la clinica)
--                          SELECT is_admin() -> reemplazada por una policy
--                          que permite: el propio perfil, platform_admin, O
--                          cualquier usuario que comparta una clinica activa
--                          con el perfil consultado (via clinic_members).
--                          Esto es necesario porque getClinicMembers() en
--                          src/lib/clinic-data.ts:194 lee profiles de otros
--                          usuarios de la MISMA clinica desde el cliente de
--                          Supabase del frontend (no desde el backend con
--                          service role) para mostrar el listado de equipo;
--                          restringir a solo "auth.uid() = id" rompe esa
--                          pantalla para clinic_admin/receptionist.
--  10) enqueue_notification_event: revoca EXECUTE de anon/authenticated.
--      Confirmado por grep en el repo (rg "enqueue_notification_event" en
--      src/, backend/, supabase/) que esta funcion SOLO se invoca desde
--      triggers internos (perform public.enqueue_notification_event(...) en
--      020_notifications_base.sql, lineas 519/536/590/600/663/711/761);
--      nunca se llama desde frontend ni desde el backend Express. Revocar el
--      grant no rompe ese flujo: las funciones trigger que la invocan
--      (notification_appointment_created_trigger y similares) son
--      SECURITY DEFINER, por lo que la llamada interna a
--      enqueue_notification_event corre con los privilegios del rol
--      definidor de la funcion trigger (no con el rol de la sesion HTTP que
--      disparo el INSERT/UPDATE original), y ese rol nunca pierde su propio
--      EXECUTE porque el REVOKE solo afecta a anon/authenticated.
--
-- ROLLBACK
-- Cada bloque DROP POLICY + CREATE POLICY (y la funcion nueva) es reversible
-- ejecutando el bloque inverso documentado al final de este archivo (seccion
-- ROLLBACK). No se borra ni modifica ninguna fila de datos en esta
-- migracion: solo definiciones de policies, una funcion nueva y un grant.

begin;

-- ===========================================================================
-- 1) patients
-- ===========================================================================
drop policy if exists "base admins can manage patients" on public.patients;

create policy "clinic scoped staff manage patients"
  on public.patients
  for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 2) appointments (colapsa las 2 policies redundantes en una sola)
-- ===========================================================================
drop policy if exists "admins can manage all appointments" on public.appointments;
drop policy if exists "base admins can manage appointments" on public.appointments;

create policy "clinic scoped staff manage appointments"
  on public.appointments
  for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 3) payments (deuda conocida de permisos por rol, ver comentario arriba)
-- ===========================================================================
drop policy if exists "admins can manage payments" on public.payments;

create policy "clinic scoped staff manage payments"
  on public.payments
  for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 4) professionals (deuda conocida de permisos por rol; lectura publica NO se toca)
-- ===========================================================================
drop policy if exists "base admins can manage professionals" on public.professionals;

create policy "clinic scoped staff manage professionals"
  on public.professionals
  for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 5) services (deuda conocida de permisos por rol; lectura publica NO se toca)
-- ===========================================================================
drop policy if exists "base admins can manage services" on public.services;

create policy "clinic scoped staff manage services"
  on public.services
  for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 6) booking_settings (deuda conocida de permisos por rol; lectura publica NO se toca)
-- ===========================================================================
drop policy if exists "base admins can manage booking settings" on public.booking_settings;

create policy "clinic scoped staff manage booking settings"
  on public.booking_settings
  for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 7) clinic_members
--    Unica tabla con restriccion por rol en esta migracion: solo
--    platform_admin / clinic_admin / admin pueden crear, editar o borrar
--    miembros. receptionist/professional solo pueden LEER el listado.
-- ===========================================================================
create or replace function public.can_manage_clinic_members(p_clinic_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.active = true
      and cm.clinic_id = p_clinic_id
      and cm.role::text in ('clinic_admin', 'admin')
  );
$$;

comment on function public.can_manage_clinic_members(uuid) is
  'True solo para platform_admin o para un miembro activo con rol clinic_admin/admin de esa clinica. No incluye receptionist ni professional. Usar para INSERT/UPDATE/DELETE de clinic_members; para SELECT (listado de equipo) usar can_access_clinic.';

drop policy if exists "admins can manage clinic memberships" on public.clinic_members;
drop policy if exists "members can read own clinic memberships" on public.clinic_members;

create policy "clinic admins manage clinic memberships"
  on public.clinic_members
  for all
  using (public.can_manage_clinic_members(clinic_id))
  with check (public.can_manage_clinic_members(clinic_id));

create policy "clinic staff can read clinic roster"
  on public.clinic_members
  for select
  using (user_id = auth.uid() or public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 8) message_logs
-- ===========================================================================
drop policy if exists "admins can manage message logs" on public.message_logs;

create policy "clinic scoped staff manage message logs"
  on public.message_logs
  for all
  using (public.can_access_clinic(clinic_id))
  with check (public.can_access_clinic(clinic_id));

-- ===========================================================================
-- 9) profiles (no tiene clinic_id)
--    - Gestion (insert/update/delete de perfiles de OTROS usuarios): solo
--      platform_admin. Ningun flujo de frontend depende de que un
--      clinic_admin edite el profile de un tercero.
--    - Lectura: el propio perfil, platform_admin, o cualquier usuario que
--      comparta una clinica activa con el perfil consultado (necesario
--      para el listado de equipo en getClinicMembers()).
-- ===========================================================================
drop policy if exists "admins can manage profiles" on public.profiles;
drop policy if exists "users can read own profile" on public.profiles;

create policy "platform admins manage profiles"
  on public.profiles
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "users and clinic teammates can read profiles"
  on public.profiles
  for select
  using (
    auth.uid() = id
    or public.is_platform_admin()
    or exists (
      select 1
      from public.clinic_members me
      join public.clinic_members them
        on them.clinic_id = me.clinic_id
       and them.active = true
      where me.user_id = auth.uid()
        and me.active = true
        and them.user_id = profiles.id
    )
  );

-- "users can update own profile" (auth.uid() = id) ya esta correcta y no se toca.

-- ===========================================================================
-- 10) enqueue_notification_event: bloquear invocacion directa via API
-- ===========================================================================
revoke execute on function public.enqueue_notification_event(
  text, text, uuid, uuid, uuid, uuid, jsonb
) from anon, authenticated;

commit;

-- ===========================================================================
-- ROLLBACK (no ejecutar como parte de esta migracion; guardar para revertir
-- manualmente si algo se rompe en produccion)
-- ===========================================================================
-- begin;
--
-- drop policy if exists "clinic scoped staff manage patients" on public.patients;
-- create policy "base admins can manage patients" on public.patients for all
--   using (public.is_admin()) with check (public.is_admin());
--
-- drop policy if exists "clinic scoped staff manage appointments" on public.appointments;
-- create policy "admins can manage all appointments" on public.appointments for all
--   using (public.is_admin()) with check (public.is_admin());
-- create policy "base admins can manage appointments" on public.appointments for all
--   using (public.is_admin()) with check (public.is_admin());
--
-- drop policy if exists "clinic scoped staff manage payments" on public.payments;
-- create policy "admins can manage payments" on public.payments for all
--   using (public.is_admin()) with check (public.is_admin());
--
-- drop policy if exists "clinic scoped staff manage professionals" on public.professionals;
-- create policy "base admins can manage professionals" on public.professionals for all
--   using (public.is_admin()) with check (public.is_admin());
--
-- drop policy if exists "clinic scoped staff manage services" on public.services;
-- create policy "base admins can manage services" on public.services for all
--   using (public.is_admin()) with check (public.is_admin());
--
-- drop policy if exists "clinic scoped staff manage booking settings" on public.booking_settings;
-- create policy "base admins can manage booking settings" on public.booking_settings for all
--   using (public.is_admin()) with check (public.is_admin());
--
-- drop policy if exists "clinic admins manage clinic memberships" on public.clinic_members;
-- drop policy if exists "clinic staff can read clinic roster" on public.clinic_members;
-- create policy "admins can manage clinic memberships" on public.clinic_members for all
--   using (public.is_admin()) with check (public.is_admin());
-- create policy "members can read own clinic memberships" on public.clinic_members for select
--   using (user_id = auth.uid() or public.is_admin());
-- drop function if exists public.can_manage_clinic_members(uuid);
--
-- drop policy if exists "clinic scoped staff manage message logs" on public.message_logs;
-- create policy "admins can manage message logs" on public.message_logs for all
--   using (public.is_admin()) with check (public.is_admin());
--
-- drop policy if exists "platform admins manage profiles" on public.profiles;
-- drop policy if exists "users and clinic teammates can read profiles" on public.profiles;
-- create policy "admins can manage profiles" on public.profiles for all
--   using (public.is_admin()) with check (public.is_admin());
-- create policy "users can read own profile" on public.profiles for select
--   using (auth.uid() = id or public.is_admin());
--
-- grant execute on function public.enqueue_notification_event(
--   text, text, uuid, uuid, uuid, uuid, jsonb
-- ) to anon, authenticated;
--
-- commit;
