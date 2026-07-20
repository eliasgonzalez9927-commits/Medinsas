-- Flujo de aceptacion de invitacion: el invitado entra con su propia
-- cuenta (nueva o existente) y queda asociado a la clinica, en vez de
-- que el admin cree todo manualmente.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.

-- invitation_token nunca se completaba hasta ahora. A partir de esta
-- migracion se genera solo; se backfillean las invitaciones pendientes
-- existentes para que tambien tengan un link valido.
alter table public.user_invitations
  alter column invitation_token set default gen_random_uuid();

update public.user_invitations
  set invitation_token = gen_random_uuid()
  where invitation_token is null;

create unique index if not exists user_invitations_token_idx
  on public.user_invitations(invitation_token);

-- ----------------------------------------------------------------------------
-- get_invitation_by_token
--
-- Publica (sin login) - es el primer paso de /invitacion/:token. Devuelve
-- solo lo necesario para mostrar la pantalla, nunca el token ni otras
-- columnas internas. Solo resuelve invitaciones pendientes (una vez
-- aceptada o borrada por cancelacion, el link deja de servir).
-- ----------------------------------------------------------------------------
create or replace function public.get_invitation_by_token(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation record;
  v_clinic_name text;
  v_account_exists boolean;
begin
  select id, clinic_id, email, full_name, role, status
    into v_invitation
    from public.user_invitations
    where invitation_token = p_token
      and status = 'pending';

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  select name into v_clinic_name from public.clinics where id = v_invitation.clinic_id;

  select exists (
    select 1 from auth.users u where lower(u.email) = lower(v_invitation.email)
  ) into v_account_exists;

  return jsonb_build_object(
    'full_name', v_invitation.full_name,
    'email', v_invitation.email,
    'role', v_invitation.role,
    'clinic_name', coalesce(v_clinic_name, 'Medin'),
    'account_exists', v_account_exists
  );
end;
$$;

revoke all on function public.get_invitation_by_token(uuid) from public;
grant execute on function public.get_invitation_by_token(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- accept_user_invitation
--
-- Requiere sesion activa. Valida que el email de la sesion sea el mismo
-- que el de la invitacion (no alcanza con conocer el token - hay que
-- ser dueño de ese email), crea (o reactiva) la membresia y marca la
-- invitacion como aceptada. Atomico: todo o nada.
-- ----------------------------------------------------------------------------
create or replace function public.accept_user_invitation(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invitation record;
  v_clinic_name text;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_uid;

  select id, clinic_id, email, role, location_id, professional_id, status
    into v_invitation
    from public.user_invitations
    where invitation_token = p_token
    for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING' using errcode = 'P0003';
  end if;

  if lower(v_email) <> lower(v_invitation.email) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  insert into public.clinic_members (clinic_id, user_id, role, active, location_id, professional_id)
  values (v_invitation.clinic_id, v_uid, v_invitation.role, true, v_invitation.location_id, v_invitation.professional_id)
  on conflict (clinic_id, user_id) do update
    set role = excluded.role,
        active = true,
        location_id = excluded.location_id,
        professional_id = excluded.professional_id,
        updated_at = now();

  update public.user_invitations
    set status = 'accepted',
        accepted_at = now(),
        updated_at = now()
    where id = v_invitation.id;

  select name into v_clinic_name from public.clinics where id = v_invitation.clinic_id;

  return jsonb_build_object('clinic_name', coalesce(v_clinic_name, 'Medin'), 'role', v_invitation.role);
end;
$$;

revoke all on function public.accept_user_invitation(uuid) from public;
grant execute on function public.accept_user_invitation(uuid) to authenticated;
