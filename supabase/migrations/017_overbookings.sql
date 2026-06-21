alter table public.appointments
  add column if not exists is_overbooking boolean not null default false,
  add column if not exists overbooking_reason text,
  add column if not exists overbooking_authorized_by uuid references auth.users(id) on delete set null,
  add column if not exists overbooking_created_by uuid references auth.users(id) on delete set null,
  add column if not exists overbooking_notes text,
  add column if not exists overbooking_conflict_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists overbooking_created_at timestamptz;

create index if not exists appointments_is_overbooking_idx
  on public.appointments(clinic_id, is_overbooking)
  where is_overbooking = true;

create index if not exists appointments_professional_starts_at_idx
  on public.appointments(professional_id, starts_at);

create index if not exists audit_logs_overbooking_idx
  on public.audit_logs(action, created_at desc)
  where action like 'overbooking_%';

drop policy if exists "clinic staff can insert audit logs" on public.audit_logs;
create policy "clinic staff can insert audit logs"
  on public.audit_logs for insert
  with check (
    public.can_access_clinic(clinic_id)
    and user_id = auth.uid()
  );
