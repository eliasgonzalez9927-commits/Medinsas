-- Historia clinica (Fase 1: notas de texto del profesional).
--
-- Alcance deliberadamente acotado: el medico escribe/edita una nota de
-- texto por turno atendido. No incluye grabacion de audio ni
-- transcripcion automatica - eso es una Fase 2 separada, que requiere
-- ademas un flujo de consentimiento del paciente antes de grabar nada.
--
-- Regla de acceso explicita del producto: la historia clinica la ve
-- SOLO el profesional que la escribio. Ni admin, ni recepcion, ni otros
-- profesionales de la misma clinica tienen acceso - a diferencia del
-- resto de la app, donde is_admin() todavia deja pasar a "professional"
-- para casi todo (ver PR #22). Por eso esta tabla no usa is_admin() en
-- ninguna policy: usa su propia validacion contra clinic_members,
-- exigiendo que el usuario autenticado este vinculado como ese mismo
-- profesional en esa misma clinica.

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  notes text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medical_records_patient_idx on public.medical_records(patient_id);
create index if not exists medical_records_professional_idx on public.medical_records(professional_id);
create index if not exists medical_records_appointment_idx on public.medical_records(appointment_id);

alter table public.medical_records enable row level security;

-- SELECT: solo el profesional tratante (via clinic_members activo).
create policy "professional reads own medical records"
  on public.medical_records
  for select
  using (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id = auth.uid()
        and cm.clinic_id = medical_records.clinic_id
        and cm.professional_id = medical_records.professional_id
        and cm.active = true
    )
  );

-- INSERT: solo puede crear notas bajo su propio professional_id.
create policy "professional creates own medical records"
  on public.medical_records
  for insert
  with check (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id = auth.uid()
        and cm.clinic_id = medical_records.clinic_id
        and cm.professional_id = medical_records.professional_id
        and cm.active = true
    )
  );

-- UPDATE: idem, y no puede reasignar la nota a otro professional_id.
create policy "professional updates own medical records"
  on public.medical_records
  for update
  using (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id = auth.uid()
        and cm.clinic_id = medical_records.clinic_id
        and cm.professional_id = medical_records.professional_id
        and cm.active = true
    )
  )
  with check (
    exists (
      select 1 from public.clinic_members cm
      where cm.user_id = auth.uid()
        and cm.clinic_id = medical_records.clinic_id
        and cm.professional_id = medical_records.professional_id
        and cm.active = true
    )
  );

-- Deliberadamente sin policy de DELETE: una nota clinica no se borra
-- desde la app (integridad del registro medico-legal). Con RLS activo
-- y sin policy de delete, cualquier intento de borrado queda denegado
-- por defecto para todos los roles, incluido admin.
