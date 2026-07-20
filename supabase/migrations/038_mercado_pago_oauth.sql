-- Soporte para que cada clinica conecte su propia cuenta de Mercado Pago
-- via OAuth, en vez de usar un token global de plataforma.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.
alter table public.payment_settings
  add column if not exists refresh_token_encrypted text,
  add column if not exists mp_user_id text,
  add column if not exists token_expires_at timestamptz,
  add column if not exists connected_at timestamptz;
