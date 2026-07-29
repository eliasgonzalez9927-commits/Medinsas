import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { SuperadminShell } from "./SuperadminShell";

export function SuperadminPlansPage() { const [plans,setPlans]=useState<any[]>([]); useEffect(()=>{supabase.from("subscription_plans").select("*").order("monthly_price").then(({data})=>setPlans(data??[]));},[]); return <SuperadminShell title="Planes" description="Catálogo comercial SaaS de Medin."><div className="grid gap-4 lg:grid-cols-5">{plans.map(plan=><div key={plan.id} className="rounded-lg border border-clinic-line bg-white p-4"><p className="font-semibold">{plan.name}</p><p className="mt-2 text-xl font-semibold">${Number(plan.monthly_price).toLocaleString("es-AR")}</p><p className="text-sm text-clinic-muted">Setup ${Number(plan.setup_price??0).toLocaleString("es-AR")}</p><p className="mt-3 text-sm">{plan.max_professionals??"∞"} profesionales · {plan.max_users??"∞"} usuarios</p></div>)}</div></SuperadminShell>; }

const SUBSCRIPTION_STATUS_STYLES: Record<string, string> = {
  active: "text-emerald-700",
  trial: "text-clinic-muted",
  past_due: "text-amber-700 font-semibold",
  suspended: "text-red-700 font-semibold",
  cancelled: "text-clinic-muted"
};

export function SuperadminSubscriptionsPage() {
  const [subscriptions,setSubscriptions]=useState<any[]>([]); const [requests,setRequests]=useState<any[]>([]); const [selected,setSelected]=useState<any>(null); const [action,setAction]=useState<"approve"|"reject"|null>(null); const [notes,setNotes]=useState(""); const [error,setError]=useState(""); const [saving,setSaving]=useState(false); const [busySubscriptionId,setBusySubscriptionId]=useState<string|null>(null);
  async function load() { const [subs,pending] = await Promise.all([supabase.from("clinic_subscriptions").select("*, clinics(name,slug), subscription_plans(name,monthly_price,currency)").order("updated_at",{ascending:false}),supabase.from("plan_change_requests").select("id,status,created_at, clinics(name), requested_plan:subscription_plans!plan_change_requests_requested_plan_id_fkey(name,monthly_price,setup_price,currency), current_plan:subscription_plans!plan_change_requests_current_plan_id_fkey(name), profiles!plan_change_requests_requested_by_fkey(full_name)").eq("status","pending").order("created_at",{ascending:false})]); if(subs.error) throw subs.error; if(pending.error) throw pending.error; setSubscriptions(subs.data??[]); setRequests(pending.data??[]); }
  useEffect(()=>{load().catch((err)=>setError(err instanceof Error?err.message:"No pudimos cargar suscripciones."));},[]);
  async function resolve() { if(!selected||!action) return; if(action==="reject"&&!notes.trim()) return setError("Indicá el motivo del rechazo."); setSaving(true); setError(""); const {error:rpcError}=await supabase.rpc("resolve_plan_change_request",{p_request_id:selected.id,p_action:action,p_notes:notes.trim()||null}); if(rpcError){setError(rpcError.message);setSaving(false);return;} setSelected(null);setAction(null);setNotes("");setSaving(false);await load(); }

  // Pago manual (efectivo, transferencia directa, etc. fuera de Mercado
  // Pago) - deja constancia en saas_billing_records para no perder el
  // registro, y avanza el periodo 30 dias igual que si hubiera pagado por
  // MP.
  async function markPaidManually(item: any) {
    if (!window.confirm(`¿Confirmás que ${item.clinics?.name} pagó su suscripción? Esto reactiva el acceso y avanza el período 30 días.`)) return;
    setBusySubscriptionId(item.id);
    setError("");
    try {
      const now = new Date();
      const periodEnd = item.current_period_end ? new Date(item.current_period_end) : now;
      const nextPeriodEnd = new Date(Math.max(periodEnd.getTime(), now.getTime()) + 30 * 24 * 60 * 60 * 1000);
      const { error: billingError } = await supabase.from("saas_billing_records").insert({
        clinic_id: item.clinic_id,
        subscription_id: item.id,
        type: "subscription",
        amount: item.subscription_plans?.monthly_price ?? 0,
        currency: item.subscription_plans?.currency ?? "ARS",
        status: "approved",
        payment_method: "manual",
        due_date: periodEnd.toISOString().slice(0, 10),
        period_start: periodEnd.toISOString().slice(0, 10),
        period_end: nextPeriodEnd.toISOString().slice(0, 10),
        paid_at: now.toISOString(),
        notes: "Marcado como pagado a mano desde Superadmin"
      });
      if (billingError) throw billingError;
      const { error: subError } = await supabase.from("clinic_subscriptions").update({
        status: "active",
        current_period_start: periodEnd.toISOString(),
        current_period_end: nextPeriodEnd.toISOString(),
        suspended_at: null,
        updated_at: now.toISOString()
      }).eq("id", item.id);
      if (subError) throw subError;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos registrar el pago.");
    } finally {
      setBusySubscriptionId(null);
    }
  }

  // Extension de gracia sin pago (ej. un cliente avisó que paga en 2 días
  // más) - solo corre la fecha de vencimiento, no genera ningún registro
  // de pago.
  async function extendGracePeriod(item: any) {
    const daysInput = window.prompt("¿Cuántos días de gracia le das (sin pago)?", "5");
    const days = Number(daysInput);
    if (!daysInput || !Number.isFinite(days) || days <= 0) return;
    setBusySubscriptionId(item.id);
    setError("");
    try {
      const base = item.current_period_end ? new Date(item.current_period_end) : new Date();
      const extended = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
      const { error: subError } = await supabase.from("clinic_subscriptions").update({
        status: "active",
        current_period_end: extended.toISOString(),
        suspended_at: null,
        updated_at: new Date().toISOString()
      }).eq("id", item.id);
      if (subError) throw subError;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos extender el plazo.");
    } finally {
      setBusySubscriptionId(null);
    }
  }

  return <SuperadminShell title="Suscripciones" description="Estado comercial, vencimientos y solicitudes SaaS.">{error&&<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}<h2 className="mb-3 text-lg font-semibold">Solicitudes pendientes</h2><div className="mb-6 overflow-hidden rounded-lg border border-clinic-line bg-white">{requests.map(item=><div key={item.id} className="grid gap-2 border-b border-clinic-line px-4 py-3 lg:grid-cols-[1fr_1fr_1fr_140px_1fr_auto]"><p className="font-semibold">{item.clinics?.name}</p><p>{item.current_plan?.name??"Sin plan"}</p><p>{item.requested_plan?.name??"Plan solicitado"}</p><p className="text-sm text-clinic-muted">{new Date(item.created_at).toLocaleDateString("es-AR")}</p><p className="text-sm text-amber-700">Pending · {item.profiles?.full_name??"Equipo clínica"}</p><div className="flex gap-2"><Button onClick={()=>{setSelected(item);setAction("approve");setNotes("");}}>Aprobar</Button><Button onClick={()=>{setSelected(item);setAction("reject");setNotes("");}}>Rechazar</Button></div></div>)}{!requests.length&&<p className="p-5 text-sm text-clinic-muted">No hay solicitudes pendientes.</p>}</div><h2 className="mb-3 text-lg font-semibold">Suscripciones activas</h2><div className="overflow-hidden rounded-lg border border-clinic-line bg-white">{subscriptions.map(item=><div key={item.id} className="grid gap-2 border-b border-clinic-line px-4 py-3 md:grid-cols-5 md:items-center"><p className="font-semibold">{item.clinics?.name}</p><p>{item.subscription_plans?.name??"Sin plan"}</p><p className={`text-sm ${SUBSCRIPTION_STATUS_STYLES[item.status] ?? "text-clinic-muted"}`}>{item.status}</p><p className="text-sm text-clinic-muted">Vence: {item.current_period_end?new Date(item.current_period_end).toLocaleDateString("es-AR"):"A confirmar"}</p><div className="flex gap-2"><Button disabled={busySubscriptionId===item.id} onClick={()=>markPaidManually(item)}>{busySubscriptionId===item.id?"...":"Marcar pagado"}</Button><Button disabled={busySubscriptionId===item.id} onClick={()=>extendGracePeriod(item)}>Extender</Button></div></div>)}</div>{selected&&action&&<div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><section className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"><h2 className="text-xl font-semibold">{action==="approve"?"Aprobar cambio de plan":"Rechazar solicitud"}</h2>{action==="approve"?<><p className="mt-3 text-sm text-clinic-muted">Vas a cambiar el plan de {selected.clinics?.name} de {selected.current_plan?.name??"Sin plan"} a {selected.requested_plan?.name}.</p><p className="mt-2 text-sm">Mensual: ${Number(selected.requested_plan?.monthly_price??0).toLocaleString("es-AR")} · Setup: ${Number(selected.requested_plan?.setup_price??0).toLocaleString("es-AR")}</p></>:<p className="mt-3 text-sm text-clinic-muted">Indicá el motivo del rechazo. La clínica podrá volver a solicitar otro cambio.</p>}<label className="mt-4 block text-sm font-medium">{action==="reject"?"Motivo de rechazo":"Notas internas (opcional)"}<textarea value={notes} onChange={event=>setNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-lg border border-clinic-line p-3 text-sm" required={action==="reject"}/></label><div className="mt-5 flex justify-end gap-2"><Button onClick={()=>{setSelected(null);setAction(null);setNotes("");}}>Cancelar</Button><Button disabled={saving} onClick={resolve} variant="primary">{saving?"Guardando...":action==="approve"?"Aprobar cambio":"Rechazar solicitud"}</Button></div></section></div>}</SuperadminShell>;
}
