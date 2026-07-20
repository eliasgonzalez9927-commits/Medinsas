-- Historia clinica / evolucion clinica: modelo tipado.
--
-- Ya fue aplicada manualmente contra el proyecto de Supabase compartido
-- (verificado: constraints, indices y backfill de las 3 filas existentes
-- confirmados via SQL Editor). Este archivo documenta esa migracion para
-- que el historial del repo quede consistente con lo que realmente esta
-- desplegado, y para que un entorno nuevo pueda reproducirla.
--
-- Contexto del backfill (no reproducible automaticamente, ya ejecutado):
-- las filas existentes de medical_records se clasificaron segun
-- appointment_id (not null -> appointment_evolution, null ->
-- legacy_clinical_record), record_status = 'final' para todas (no habia
-- ninguna en estado borrador), y created_by/updated_by/finalized_by se
-- resolvieron via clinic_members (clinic_id + professional_id -> user_id).
--
-- record_type:
--   appointment_evolution   - documento de una atencion concreta, requiere appointment_id
--   standalone_clinical_note - nota clinica explicita sin turno (no habilitada
--                              para crear libremente todavia, ver PatientFichaProfessionalPage)
--   legacy_clinical_record   - registro previo a este modelo, sin evidencia
--                              suficiente para clasificar con certeza
--
-- record_status: draft | final | amended
--   'final' no puede volver a 'draft' silenciosamente (no hay UPDATE que lo
--   permita desde el cliente - ver 034_medical_attention_rpc.sql).

alter table public.medical_records
  add column if not exists record_type text not null default 'legacy_clinical_record',
  add column if not exists record_status text not null default 'final',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid references auth.users(id) on delete set null,
  add column if not exists version integer not null default 1,
  add column if not exists parent_record_id uuid references public.medical_records(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_records_type_check' and conrelid = 'public.medical_records'::regclass
  ) then
    alter table public.medical_records
      add constraint medical_records_type_check
      check (record_type in ('appointment_evolution', 'standalone_clinical_note', 'legacy_clinical_record'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_records_status_check' and conrelid = 'public.medical_records'::regclass
  ) then
    alter table public.medical_records
      add constraint medical_records_status_check
      check (record_status in ('draft', 'final', 'amended'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_records_evolution' and conrelid = 'public.medical_records'::regclass
  ) then
    alter table public.medical_records
      add constraint medical_records_evolution
      check (record_type != 'appointment_evolution' or appointment_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_records_final_req' and conrelid = 'public.medical_records'::regclass
  ) then
    alter table public.medical_records
      add constraint medical_records_final_req
      check (record_status = 'draft' or (finalized_at is not null and finalized_by is not null));
  end if;
end $$;

-- Una evolucion principal por turno.
create unique index if not exists medical_records_one_evolution_per_appointment
  on public.medical_records (appointment_id)
  where record_type = 'appointment_evolution' and appointment_id is not null;

-- Timeline por paciente.
create index if not exists medical_records_clinic_patient_created_idx
  on public.medical_records (clinic_id, patient_id, created_at desc);

-- Timer real de atencion (independiente del modelo clinico de arriba).
alter table public.appointments
  add column if not exists attention_started_at timestamptz,
  add column if not exists attention_started_by uuid references auth.users(id) on delete set null,
  add column if not exists attention_finished_at timestamptz,
  add column if not exists attention_finished_by uuid references auth.users(id) on delete set null;
