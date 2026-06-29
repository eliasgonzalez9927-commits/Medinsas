-- 023_invitations_token_and_rls.sql
--
-- OBJETIVO
-- Preparar user_invitations para el flujo real de invitacion (Tarea 3):
--   1) agregar token_hash (hash SHA-256 del token, nunca el token plano) y
--      expires_at, sin tocar ni renombrar la columna legacy invitation_token;
--   2) cerrar el mismo bug de aislamiento multi-tenant que 021 corrigio en
--      otras tablas: la policy actual de user_invitations usa is_admin() sin
--      comparar clinic_id, igual que el bug critico original.
--
-- ALCANCE
--   1) ALTER TABLE: agrega token_hash, expires_at. invitation_token queda
--      como columna legacy/deprecada, sin usar, sin tocar (se podra eliminar
--      en una limpieza futura una vez confirmado que nada la lee).
--   2) Indice unico parcial sobre token_hash (solo filas no nulas) para
--      lookup rapido del backend y para evitar colisiones.
--   3) RLS: reemplaza "admins can manage user invitations" (is_admin(), sin
--      scope) por una policy que usa can_manage_clinic_members(clinic_id)
--      (ya existe desde 021): platform_admin gestiona todas; clinic_admin/
--      admin gestiona solo las de su propia clinica; receptionist/
--      professional no pueden gestionar invitaciones (ni leer ni escribir).
--      El backend usa SUPABASE_SERVICE_ROLE_KEY, que bypassea RLS por
--      diseno de Supabase: esta policy no afecta al backend, solo cierra el
--      acceso via API REST/anon-authenticated directa.
--
-- NO HACE
--   - No renombra ni elimina invitation_token.
--   - No borra ni modifica ninguna fila existente.
--   - No toca ninguna otra tabla.
--
-- ROLLBACK
--   alter table public.user_invitations drop column if exists token_hash;
--   alter table public.user_invitations drop column if exists expires_at;
--   drop policy if exists "clinic scoped staff manage user invitations" on public.user_invitations;
--   create policy "admins can manage user invitations" on public.user_invitations
--     for all using (public.is_admin()) with check (public.is_admin());

alter table public.user_invitations
  add column if not exists token_hash text,
  add column if not exists expires_at timestamptz;

comment on column public.user_invitations.invitation_token is
  'Legacy: nunca se uso en codigo. No persistir tokens en texto plano. Usar token_hash. Candidata a eliminar en limpieza futura.';
comment on column public.user_invitations.token_hash is
  'SHA-256 hex del token real. El token en texto plano solo existe en el link del email, nunca se guarda.';
comment on column public.user_invitations.expires_at is
  'Vencimiento de la invitacion. Recomendado: created_at + 7 dias.';

create unique index if not exists user_invitations_token_hash_idx
  on public.user_invitations (token_hash)
  where token_hash is not null;

drop policy if exists "admins can manage user invitations" on public.user_invitations;

create policy "clinic scoped staff manage user invitations"
  on public.user_invitations
  for all
  using (public.can_manage_clinic_members(clinic_id))
  with check (public.can_manage_clinic_members(clinic_id));
