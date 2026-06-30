-- 025_restrict_clinics_write_rls.sql
--
-- OBJETIVO
-- Cerrar el mismo bug de is_admin() para la escritura de clinics: hoy
-- receptionist y professional pueden, via RLS, insertar/actualizar/borrar
-- la fila de clinics (incluida su propia clinica). La lectura publica
-- (SELECT) no se toca: es intencional y la necesitan la reserva publica,
-- el selector multi-clinica y las landing pages.
--
-- ALCANCE (solo clinics, nada mas)
--
-- NO HACE
--   - No modifica is_admin() ni ninguna otra tabla.
--   - No toca la policy de SELECT (queda exactamente igual, publica).
--   - No borra ni modifica filas.
--
-- CRITERIO
--   - INSERT/DELETE: solo platform_admin. Hoy el producto no tiene ningun
--     flujo donde un clinic_admin cree o borre una clinica (el alta es
--     exclusiva del onboarding de Superadmin); restringir DELETE evita que
--     un clinic_admin borre por error/abuso la fila de su propia clinica.
--   - UPDATE: platform_admin o clinic_admin/admin de esa clinica
--     (reutiliza can_manage_clinic_settings de la migracion 024).

drop policy if exists "base admins can manage clinics" on public.clinics;

create policy "platform admins insert clinics"
  on public.clinics
  for insert
  with check (public.is_platform_admin());

create policy "clinic admins update clinics"
  on public.clinics
  for update
  using (public.can_manage_clinic_settings(id))
  with check (public.can_manage_clinic_settings(id));

create policy "platform admins delete clinics"
  on public.clinics
  for delete
  using (public.is_platform_admin());
