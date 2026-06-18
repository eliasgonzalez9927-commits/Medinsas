alter table public.payments
  add column if not exists expires_at timestamptz;

create index if not exists payments_expires_at_idx
  on public.payments(expires_at);
