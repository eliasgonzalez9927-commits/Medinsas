-- 026_restrict_schedule_admin_rls.sql
--
-- PROPUESTA - NO APLICADA TODAVIA. Revisar antes de ejecutar.
--
-- OBJETIVO
-- Mismo patron de is_admin() ya corregido en 021/023/024/025: receptionist y
-- professional pueden hoy, via RLS, crear/editar/borrar sedes, horarios
-- generales, excepciones de agenda y reglas de disponibilidad de CUALQUIER
-- clinica donde sean staff activo. Ninguno de estos 4 casos de uso es
-- operativo para esos roles (configuran la clinica, no la operan).
--
-- ALCANCE (solo estas 4 tablas, nada mas)
--   - locations
--   - clinic_hours
--   - clinic_schedule_exceptions
--   - availability_rules
--
-- NO HACE
--   - No modifica is_admin() ni ninguna otra tabla.
--   - No toca las policies de SELECT publicas existentes en locations y
--     availability_rules (qual: active = true) -- las necesitan la reserva
--     publica, el selector de sede en Agenda y el calculo de turnos
--     disponibles.
--   - No crea una funcion nueva: reutiliza can_manage_clinic_settings(uuid),
--     ya creada en 024_restrict_sensitive_admin_rls.sql con exactamente el
--     criterio pedido (platform_admin OR clinic_admin/admin activo de esa
--     clinica).
--   - No borra ni modifica filas.
--
-- EFECTO EN LECTURA (SELECT) para receptionist/professional
--   - locations / availability_rules: sin cambio funcional. La policy
--     publica "active = true" sigue vigente y es la que ya usan Agenda,
--     getAvailableSlots y la reserva publica; nunca dependieron de
--     is_admin() para leer. Solo dejan de ver filas con active = false
--     (sedes/reglas desactivadas), que no se usan para operar.
--   - clinic_hours / clinic_schedule_exceptions: sin SELECT publico hoy.
--     Confirmado por grep en src/ y backend/ que ninguna pantalla operativa
--     (Agenda, reservas online, turno publico) lee estas tablas; solo las
--     lee el panel de Configuracion (admin-only). Quitarles is_admin()
--     no le saca lectura a nadie que la necesite hoy.
--
-- EFECTO EN ESCRITURA (INSERT/UPDATE/DELETE)
--   - Pasa de "cualquier staff activo" a "platform_admin o clinic_admin/
--     admin activo de esa clinica" en las 4 tablas, via
--     can_manage_clinic_settings(clinic_id).
--
-- ADVERTENCIA conocida (no se corrige en este lote, solo se documenta)
--   /admin/disponibilidad sigue en el bloque de rutas operativas
--   (ADMIN_ROLES, incluye receptionist) y AvailabilityPage.tsx no tiene gate
--   interno de permisos: hoy receptionist ve los botones de crear/borrar
--   regla. Despues de esta migracion esos botones van a seguir visibles
--   pero la escritura va a fallar con un error de Supabase (RLS), no con un
--   mensaje claro. Corregir esto es un cambio de FRONTEND (ocultar los
--   controles para receptionist o mover la ruta a CLINIC_ADMIN_ROLES) y
--   queda fuera de este lote, que es solo RLS.

-- locations -------------------------------------------------------------
drop policy if exists "base admins can manage locations" on public.locations;
create policy "clinic admins manage locations"
  on public.locations
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));
-- "base public can read active locations" (qual: active = true) no se toca.

-- clinic_hours ------------------------------------------------------------
drop policy if exists "admins can manage clinic hours" on public.clinic_hours;
create policy "clinic admins manage clinic hours"
  on public.clinic_hours
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));

-- clinic_schedule_exceptions ----------------------------------------------
drop policy if exists "admins can manage clinic schedule exceptions" on public.clinic_schedule_exceptions;
create policy "clinic admins manage clinic schedule exceptions"
  on public.clinic_schedule_exceptions
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));

-- availability_rules --------------------------------------------------------
drop policy if exists "base admins can manage availability rules" on public.availability_rules;
create policy "clinic admins manage availability rules"
  on public.availability_rules
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));
-- "base public can read active availability rules" (qual: active = true) no se toca.
