create or replace function public.resolve_plan_change_request(
  p_request_id uuid,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.plan_change_requests%rowtype;
  v_subscription public.clinic_subscriptions%rowtype;
  v_current_plan public.subscription_plans%rowtype;
  v_requested_plan public.subscription_plans%rowtype;
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'INVALID_ACTION'; end if;

  select * into v_request from public.plan_change_requests where id = p_request_id for update;
  if v_request.id is null then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception 'REQUEST_ALREADY_RESOLVED'; end if;

  if p_action = 'reject' then
    if coalesce(btrim(p_notes), '') = '' then raise exception 'REJECTION_REASON_REQUIRED'; end if;
    update public.plan_change_requests set status = 'rejected', resolved_at = v_now, resolved_by = v_user_id, notes = btrim(p_notes) where id = v_request.id;
    insert into public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    values (v_request.clinic_id, v_user_id, 'clinic_plan_change_rejected', 'plan_change_request', v_request.id, jsonb_build_object('request_id', v_request.id, 'current_plan_id', v_request.current_plan_id, 'requested_plan_id', v_request.requested_plan_id, 'reason', btrim(p_notes)));
    return jsonb_build_object('status', 'rejected', 'request_id', v_request.id);
  end if;

  select * into v_subscription from public.clinic_subscriptions where clinic_id = v_request.clinic_id for update;
  if v_subscription.id is null then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  select * into v_requested_plan from public.subscription_plans where id = v_request.requested_plan_id and active = true;
  if v_requested_plan.id is null then raise exception 'REQUESTED_PLAN_NOT_FOUND'; end if;
  if v_subscription.plan_id is not null then select * into v_current_plan from public.subscription_plans where id = v_subscription.plan_id; end if;

  update public.plan_change_requests set status = 'approved', resolved_at = v_now, resolved_by = v_user_id, notes = nullif(btrim(coalesce(p_notes, '')), '') where id = v_request.id;
  update public.clinic_subscriptions set plan_id = v_requested_plan.id, status = 'active', current_period_start = v_now, current_period_end = v_now + interval '30 days', monthly_fee_status = 'pending', setup_fee_status = case when setup_fee_status in ('paid','waived') then setup_fee_status else 'pending' end, updated_at = v_now where id = v_subscription.id;

  insert into public.saas_billing_records (clinic_id, subscription_id, type, amount, currency, status, due_date, notes)
  values (v_request.clinic_id, v_subscription.id, 'monthly', v_requested_plan.monthly_price, coalesce(v_requested_plan.currency, 'ARS'), 'pending', current_date + 7, 'Cambio de plan aprobado manualmente');
  if coalesce(v_requested_plan.setup_price, 0) > 0 and coalesce(v_subscription.setup_fee_status, 'pending') not in ('paid','waived') then
    insert into public.saas_billing_records (clinic_id, subscription_id, type, amount, currency, status, due_date, notes)
    values (v_request.clinic_id, v_subscription.id, 'setup', v_requested_plan.setup_price, coalesce(v_requested_plan.currency, 'ARS'), 'pending', current_date + 7, 'Setup por cambio de plan aprobado manualmente');
  end if;
  insert into public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
  values (v_request.clinic_id, v_user_id, 'clinic_plan_change_approved', 'plan_change_request', v_request.id, jsonb_build_object('request_id', v_request.id, 'previous_plan_id', v_subscription.plan_id, 'previous_plan_name', v_current_plan.name, 'new_plan_id', v_requested_plan.id, 'new_plan_name', v_requested_plan.name));
  return jsonb_build_object('status', 'approved', 'request_id', v_request.id, 'plan_id', v_requested_plan.id);
end;
$$;

grant execute on function public.resolve_plan_change_request(uuid, text, text) to authenticated;
