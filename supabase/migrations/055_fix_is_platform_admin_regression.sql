-- Fix urgente: la migracion 053 (esta misma noche) hizo
-- "create or replace function public.is_platform_admin()" sin revisar que
-- esa funcion YA EXISTIA desde la migracion 012, con una definicion mas
-- amplia (chequeaba profiles.role='platform_admin' O clinic_members.role
-- ='platform_admin'). La version de la 053 solo dejo el chequeo de
-- profiles.role, tirando el chequeo por clinic_members - y como
-- is_platform_admin() es una funcion GLOBAL (no versionada por migracion),
-- ese cambio afecto retroactivamente TODAS las policies que ya la usaban
-- desde antes: subscription_plans, clinic_subscriptions, clinic_modules,
-- clinic_onboarding_steps, audit_logs, import_jobs, overbookings,
-- notificaciones, saas_billing_records, subscription_addons,
-- plan_change_requests, y la funcion delete_clinic_member. Cualquier
-- platform_admin cuyo rol viviera solo en clinic_members (no en
-- profiles.role) pudo haber perdido acceso silenciosamente a todo eso
-- desde que se corrio la 053.
--
-- Se restaura la definicion original (ambos chequeos), que es la que
-- estuvo en produccion desde la migracion 012.
create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role::text = 'platform_admin'
  )
  or exists (
    select 1
    from public.clinic_members cm
    where cm.user_id = auth.uid()
      and cm.active = true
      and cm.role::text = 'platform_admin'
  );
$$;
