-- Bug real encontrado en vivo (2026-07-28): profesionales y sedes
-- "mezclandose" entre clinicas. La causa de fondo no es un problema de
-- consultas del frontend (esas ya filtran por clinic_id) sino que la
-- politica RLS "admins can manage X" de casi todo el esquema operativo
-- usa public.is_admin(), que solo responde "¿este usuario es staff de
-- ALGUNA clinica?" sin verificar que sea la clinica dueña de la fila. En
-- la practica, hoy un clinic_admin/recepcionista/profesional de la
-- Clinica A puede leer y escribir profesionales, sedes, servicios,
-- disponibilidad, turnos y pacientes de la Clinica B a nivel de base de
-- datos - la separacion entre clinicas dependia solo de que el codigo de
-- la app filtrara bien (y un caso, getProfessionalById, no lo hacia).
--
-- Se agrega is_admin_for_clinic(target_clinic_id) - misma logica que
-- is_admin() pero exige que la membresia en clinic_members sea
-- especificamente de esa clinica (platform_admin sigue teniendo bypass
-- total, es el rol de Superadmin que administra todas las clinicas).
--
-- Alcance de este fix: las tablas directamente reportadas (professionals,
-- locations) mas las que comparten el mismo origen (migracion 004) y las
-- de mayor sensibilidad (patients, appointments) que son igual de simples
-- de corregir (columna clinic_id directa, sin necesidad de joins). Se
-- encontro el mismo patron en otras ~20 tablas (payments, invoices,
-- fiscal_settings, medical_documents, etc.) que quedan pendientes para una
-- auditoria de seguridad dedicada aparte - tocar datos financieros/fiscales
-- sin verificar cada join a mano es mas riesgo del que vale la pena correr
-- en este mismo cambio.

create or replace function public.is_admin_for_clinic(target_clinic_id uuid)
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
  )
  or exists (
    select 1
    from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.active = true
      and cm.clinic_id = target_clinic_id
      and cm.role::text in ('platform_admin', 'clinic_admin', 'receptionist', 'professional', 'admin')
  );
$$;

-- clinics: la fila se identifica a si misma por id.
drop policy if exists "admins can manage clinics" on public.clinics;
create policy "admins can manage clinics"
  on public.clinics for all
  using (public.is_admin_for_clinic(id))
  with check (public.is_admin_for_clinic(id));

drop policy if exists "admins can manage locations" on public.locations;
create policy "admins can manage locations"
  on public.locations for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage professionals" on public.professionals;
create policy "admins can manage professionals"
  on public.professionals for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage specialties" on public.specialties;
create policy "admins can manage specialties"
  on public.specialties for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage services" on public.services;
create policy "admins can manage services"
  on public.services for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage availability rules" on public.availability_rules;
create policy "admins can manage availability rules"
  on public.availability_rules for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage availability blocks" on public.availability_blocks;
create policy "admins can manage availability blocks"
  on public.availability_blocks for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage patients" on public.patients;
create policy "admins can manage patients"
  on public.patients for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage booking settings" on public.booking_settings;
create policy "admins can manage booking settings"
  on public.booking_settings for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

-- whatsapp_templates (migracion 003) esta muerta en el codigo (sin
-- referencias en src/api) pero se corrige igual, ya que RLS floja en una
-- tabla sin usar sigue siendo RLS floja.
drop policy if exists "admins can manage whatsapp templates" on public.whatsapp_templates;
create policy "admins can manage whatsapp templates"
  on public.whatsapp_templates for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage reminders" on public.reminders;
create policy "admins can manage reminders"
  on public.reminders for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage all appointments" on public.appointments;
create policy "admins can manage all appointments"
  on public.appointments for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

-- Las tablas WhatsApp nuevas (migracion 050, esta misma sesion) tenian el
-- mismo bug desde el dia uno - se corrigen aca mismo.
drop policy if exists "admins can manage whatsapp settings" on public.whatsapp_settings;
create policy "admins can manage whatsapp settings"
  on public.whatsapp_settings for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

drop policy if exists "admins can manage whatsapp templates status" on public.whatsapp_message_templates;
create policy "admins can manage whatsapp templates status"
  on public.whatsapp_message_templates for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));

-- Tablas junction/hijas sin columna clinic_id propia: se resuelve la
-- clinica dueña via join a la tabla padre.
drop policy if exists "admins can manage professional specialties" on public.professional_specialties;
create policy "admins can manage professional specialties"
  on public.professional_specialties for all
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_specialties.professional_id
      and public.is_admin_for_clinic(p.clinic_id)
  ))
  with check (exists (
    select 1 from public.professionals p
    where p.id = professional_specialties.professional_id
      and public.is_admin_for_clinic(p.clinic_id)
  ));

drop policy if exists "admins can manage professional services" on public.professional_services;
create policy "admins can manage professional services"
  on public.professional_services for all
  using (exists (
    select 1 from public.professionals p
    where p.id = professional_services.professional_id
      and public.is_admin_for_clinic(p.clinic_id)
  ))
  with check (exists (
    select 1 from public.professionals p
    where p.id = professional_services.professional_id
      and public.is_admin_for_clinic(p.clinic_id)
  ));

drop policy if exists "admins can manage appointment events" on public.appointment_events;
create policy "admins can manage appointment events"
  on public.appointment_events for all
  using (exists (
    select 1 from public.appointments a
    where a.id = appointment_events.appointment_id
      and public.is_admin_for_clinic(a.clinic_id)
  ))
  with check (exists (
    select 1 from public.appointments a
    where a.id = appointment_events.appointment_id
      and public.is_admin_for_clinic(a.clinic_id)
  ));
