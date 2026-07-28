-- Mismo bug de la migracion 051 (is_admin() sin acotar por clinica),
-- encontrado en esta tabla al arreglar el flujo de invitaciones (el mail
-- nunca se mandaba porque pegaba a /api/messages/send, que no existia).
-- Sin este fix, un admin de la Clinica A podia ver/cancelar invitaciones
-- pendientes de la Clinica B.
drop policy if exists "admins can manage user invitations" on public.user_invitations;
create policy "admins can manage user invitations"
  on public.user_invitations for all
  using (public.is_admin_for_clinic(clinic_id))
  with check (public.is_admin_for_clinic(clinic_id));
