-- RPC para borrar (no desactivar) un miembro de clinic_members.
--
-- NO APLICADA TODAVIA. Pendiente de revision antes de correr contra
-- Supabase.
--
-- Por que RPC y no dejar el DELETE a la policy general:
-- la unica policy activa hoy sobre public.clinic_members es
-- "admins can manage clinic memberships" (FOR ALL, using is_admin()), y
-- is_admin() devuelve true para CUALQUIER rol de staff activo
-- (platform_admin, clinic_admin, receptionist, professional) - no solo
-- para superadmin. Ocultar el boton de "Borrar" en el frontend salvo
-- para platform_admin no alcanza: cualquier otro rol podria borrar un
-- miembro llamando a la API directamente. Corregir esa policy general
-- es un cambio de alto impacto (afecta la gestion de usuarios de toda
-- la app) y queda deliberadamente fuera de esta migracion, igual que se
-- documento en 034_medical_attention_rpc.sql para appointments.
--
-- Esta funcion es SECURITY DEFINER y valida ella misma que quien llama
-- es platform_admin, sin apoyarse en is_admin().
create or replace function public.delete_clinic_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_member record;
  v_is_platform_admin boolean;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role::text = 'platform_admin'
  ) or exists (
    select 1 from public.clinic_members cm
    where cm.user_id = v_uid
      and cm.active = true
      and cm.role::text = 'platform_admin'
  ) into v_is_platform_admin;

  if not v_is_platform_admin then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select id, clinic_id, user_id
    into v_member
    from public.clinic_members
    where id = p_member_id
    for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_member.user_id = v_uid then
    raise exception 'CANNOT_DELETE_SELF' using errcode = 'P0009';
  end if;

  delete from public.clinic_members where id = p_member_id;

  return jsonb_build_object('id', v_member.id, 'clinic_id', v_member.clinic_id);
end;
$$;

revoke all on function public.delete_clinic_member(uuid) from public;
grant execute on function public.delete_clinic_member(uuid) to authenticated;
