do $$
begin
  alter table public.appointment_requests
    drop constraint if exists appointment_requests_status_check;

  alter table public.appointment_requests
    add constraint appointment_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'managed'));
exception when duplicate_object then null;
end $$;

create unique index if not exists appointment_requests_one_pending_type_idx
  on public.appointment_requests(appointment_id, type)
  where status = 'pending';
