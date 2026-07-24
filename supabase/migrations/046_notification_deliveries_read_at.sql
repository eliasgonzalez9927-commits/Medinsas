-- El pipeline de eventos in_app (triggers de la migracion 020) ya funciona
-- de punta a punta, pero notification_deliveries no tenia forma de marcar
-- algo como "leido" - por eso nunca se construyo un inbox real arriba de el.
-- Se agrega read_at (nullable): estado de lectura compartido por todo el
-- equipo de la clinica, no por usuario individual (no existe user_id en
-- esta tabla y el equipo suele ser chico).

alter table public.notification_deliveries
  add column if not exists read_at timestamptz;

create index if not exists notification_deliveries_in_app_unread_idx
  on public.notification_deliveries(clinic_id, channel, read_at)
  where channel = 'in_app';
