-- Continuacion de la migracion 051 (aislamiento multi-tenant real) sobre
-- las tablas financieras/fiscales/medicas que se dejaron pendientes a
-- proposito esa vez, para no apurar un cambio de RLS sobre datos
-- sensibles sin verificar cada tabla a mano. Mismo problema de fondo:
-- "admins can manage X" usando is_admin() (solo chequea "es staff de
-- ALGUNA clinica", no de esta) permitia en teoria que un clinic_admin de
-- la Clinica A leyera/escribiera pagos, facturas, certificados fiscales
-- (ARCA) e historias clinicas de la Clinica B.
--
-- Usa is_admin_for_clinic(clinic_id) de la migracion 051. Las tablas sin
-- columna clinic_id directa (invoice_items, medical_document_items,
-- appointment_public_links, appointment_requests, patient_coverages) se
-- resuelven via join a su tabla padre.
--
-- Fuera de alcance a proposito (igual que en la 051): health_coverages y
-- health_plans son un catalogo global compartido entre TODAS las clinicas
-- (obras sociales/prepagas reales, no datos propios de una clinica) - no
-- tiene sentido acotarlos por clinic_id. subscription_plans es de solo
-- lectura y tambien global. profiles no tiene clinic_id (un usuario puede
-- pertenecer a mas de una clinica) - el riesgo mas grave ahi (auto
-- otorgarse platform_admin) ya se cerro en la migracion 053 con un
-- trigger; el resto (editar full_name/phone de otro usuario) queda como
-- riesgo residual aceptado, no de confidencialidad de datos.

drop policy if exists "admins can manage fiscal settings" on public.fiscal_settings;
create policy "admins can manage fiscal settings"
  on public.fiscal_settings for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage payments" on public.payments;
create policy "admins can manage payments"
  on public.payments for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage invoices" on public.invoices;
create policy "admins can manage invoices"
  on public.invoices for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage prescription settings" on public.prescription_settings;
create policy "admins can manage prescription settings"
  on public.prescription_settings for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage medical documents" on public.medical_documents;
create policy "admins can manage medical documents"
  on public.medical_documents for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage payment settings" on public.payment_settings;
create policy "admins can manage payment settings"
  on public.payment_settings for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage payment events" on public.payment_events;
create policy "admins can manage payment events"
  on public.payment_events for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage clinic hours" on public.clinic_hours;
create policy "admins can manage clinic hours"
  on public.clinic_hours for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage clinic schedule exceptions" on public.clinic_schedule_exceptions;
create policy "admins can manage clinic schedule exceptions"
  on public.clinic_schedule_exceptions for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage message templates" on public.message_templates;
create policy "admins can manage message templates"
  on public.message_templates for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage message logs" on public.message_logs;
create policy "admins can manage message logs"
  on public.message_logs for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

-- clinic_members ya tenia (migracion 053) un trigger que bloquea otorgar
-- el rol platform_admin sin serlo de verdad - esto suma el resto: que un
-- admin de una clinica no pueda ver/editar/desactivar miembros de OTRA.
drop policy if exists "admins can manage clinic memberships" on public.clinic_members;
create policy "admins can manage clinic memberships"
  on public.clinic_members for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

-- Tablas hijas sin clinic_id propio: se resuelve via join al padre.
drop policy if exists "admins can manage invoice items" on public.invoice_items;
create policy "admins can manage invoice items"
  on public.invoice_items for all
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and public.is_admin_for_clinic(i.clinic_id)
  ))
  with check (exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and public.is_admin_for_clinic(i.clinic_id)
  ));

drop policy if exists "admins can manage medical document items" on public.medical_document_items;
create policy "admins can manage medical document items"
  on public.medical_document_items for all
  using (exists (
    select 1 from public.medical_documents d
    where d.id = medical_document_items.medical_document_id
      and public.is_admin_for_clinic(d.clinic_id)
  ))
  with check (exists (
    select 1 from public.medical_documents d
    where d.id = medical_document_items.medical_document_id
      and public.is_admin_for_clinic(d.clinic_id)
  ));

drop policy if exists "admins can manage appointment public links" on public.appointment_public_links;
create policy "admins can manage appointment public links"
  on public.appointment_public_links for all
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_public_links.appointment_id
      and public.is_admin_for_clinic(a.clinic_id)
  ))
  with check (exists (
    select 1 from public.appointments a
    where a.id = appointment_public_links.appointment_id
      and public.is_admin_for_clinic(a.clinic_id)
  ));

drop policy if exists "admins can manage appointment requests" on public.appointment_requests;
create policy "admins can manage appointment requests"
  on public.appointment_requests for all
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_requests.appointment_id
      and public.is_admin_for_clinic(a.clinic_id)
  ))
  with check (exists (
    select 1 from public.appointments a
    where a.id = appointment_requests.appointment_id
      and public.is_admin_for_clinic(a.clinic_id)
  ));

drop policy if exists "admins can manage patient coverages" on public.patient_coverages;
create policy "admins can manage patient coverages"
  on public.patient_coverages for all
  using (exists (
    select 1 from public.patients p
    where p.id = patient_coverages.patient_id
      and public.is_admin_for_clinic(p.clinic_id)
  ))
  with check (exists (
    select 1 from public.patients p
    where p.id = patient_coverages.patient_id
      and public.is_admin_for_clinic(p.clinic_id)
  ));
