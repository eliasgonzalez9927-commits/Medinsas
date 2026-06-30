-- 024_restrict_sensitive_admin_rls.sql
--
-- OBJETIVO
-- Cerrar el bug critico de is_admin() (mismo patron ya corregido en 021/023)
-- para el lote de tablas mas sensibles que habian quedado afuera: datos
-- fiscales, configuracion/credenciales de cobros y facturacion. is_admin()
-- trata a receptionist y professional como admin pleno; estas tablas no
-- deben ser legibles ni escribibles por esos roles bajo ningun caso de uso.
--
-- ALCANCE (solo estas 5 tablas, nada mas)
--   - fiscal_settings
--   - payment_settings   (incluye access_token_encrypted, webhook_secret)
--   - payment_events
--   - invoices
--   - invoice_items
--
-- NO HACE
--   - No modifica is_admin() ni ninguna otra tabla.
--   - No toca clinic_members, profiles, ni el resto del esquema.
--   - No borra ni modifica filas.

create or replace function public.can_manage_clinic_settings(p_clinic_id uuid)
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

comment on function public.can_manage_clinic_settings(uuid) is
  'True solo para platform_admin o un miembro activo clinic_admin/admin de esa clinica. No incluye receptionist ni professional. Usar para tablas administrativas sensibles (fiscal, pagos, facturacion) donde no existe ningun caso de uso legitimo de lectura/escritura para staff operativo.';

-- fiscal_settings -----------------------------------------------------------
drop policy if exists "admins can manage fiscal settings" on public.fiscal_settings;
create policy "clinic admins manage fiscal settings"
  on public.fiscal_settings
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));

-- payment_settings ------------------------------------------------------------
drop policy if exists "admins can manage payment settings" on public.payment_settings;
create policy "clinic admins manage payment settings"
  on public.payment_settings
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));

-- payment_events --------------------------------------------------------------
drop policy if exists "admins can manage payment events" on public.payment_events;
create policy "clinic admins manage payment events"
  on public.payment_events
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));

-- invoices ----------------------------------------------------------------
drop policy if exists "admins can manage invoices" on public.invoices;
create policy "clinic admins manage invoices"
  on public.invoices
  for all
  using (public.can_manage_clinic_settings(clinic_id))
  with check (public.can_manage_clinic_settings(clinic_id));

-- invoice_items (sin clinic_id propio: resuelve via invoices) ---------------
drop policy if exists "admins can manage invoice items" on public.invoice_items;
create policy "clinic admins manage invoice items"
  on public.invoice_items
  for all
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.can_manage_clinic_settings(i.clinic_id)
    )
  )
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id
        and public.can_manage_clinic_settings(i.clinic_id)
    )
  );
