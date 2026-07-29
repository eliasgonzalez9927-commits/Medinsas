-- saas_billing_records ya existia desde la migracion 018 (clinic_id,
-- subscription_id, type, amount, currency, status, due_date, paid_at,
-- payment_method, external_reference, notes) pero nunca se conecto a
-- ningun cobro real - era pura maqueta. Se agregan las columnas que
-- faltan para generar y confirmar un pago real de Mercado Pago desde la
-- cuenta propia de Medin (no la de cada clinica).
alter table public.saas_billing_records
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text,
  add column if not exists checkout_url text;

create index if not exists saas_billing_records_mp_payment_id_idx
  on public.saas_billing_records(mp_payment_id);
