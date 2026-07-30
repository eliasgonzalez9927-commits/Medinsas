import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { SuperadminShell } from "./SuperadminShell";

const EMPTY_PLAN_FORM = { name: "", monthly_price: "0", setup_price: "0", max_professionals: "", max_users: "", max_locations: "", max_patients: "", included_messages: "", active: true };

export function SuperadminPlansPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<typeof EMPTY_PLAN_FORM>(EMPTY_PLAN_FORM);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  async function load() {
    const { data, error: loadError } = await supabase.from("subscription_plans").select("*").order("monthly_price");
    if (loadError) { setError(loadError.message); return; }
    setPlans(data ?? []);
  }
  useEffect(() => { load(); }, []);

  function openEdit(plan: any) {
    setEditing(plan);
    setCreating(false);
    setForm({
      name: plan.name ?? "",
      monthly_price: String(plan.monthly_price ?? 0),
      setup_price: String(plan.setup_price ?? 0),
      max_professionals: plan.max_professionals == null ? "" : String(plan.max_professionals),
      max_users: plan.max_users == null ? "" : String(plan.max_users),
      max_locations: plan.max_locations == null ? "" : String(plan.max_locations),
      max_patients: plan.max_patients == null ? "" : String(plan.max_patients),
      included_messages: plan.included_messages == null ? "" : String(plan.included_messages),
      active: plan.active
    });
  }

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_PLAN_FORM);
  }

  function toNullableInt(value: string) {
    const trimmed = value.trim();
    return trimmed === "" ? null : Number(trimmed);
  }

  async function save() {
    if (!form.name.trim()) { setError("El plan necesita un nombre."); return; }
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      monthly_price: Number(form.monthly_price) || 0,
      setup_price: Number(form.setup_price) || 0,
      max_professionals: toNullableInt(form.max_professionals),
      max_users: toNullableInt(form.max_users),
      max_locations: toNullableInt(form.max_locations),
      max_patients: toNullableInt(form.max_patients),
      included_messages: toNullableInt(form.included_messages),
      active: form.active
    };
    const { error: saveError } = creating
      ? await supabase.from("subscription_plans").insert(payload)
      : await supabase.from("subscription_plans").update(payload).eq("id", editing.id);
    if (saveError) { setError(saveError.message); setSaving(false); return; }
    setSaving(false);
    setEditing(null);
    setCreating(false);
    await load();
  }

  return (
    <SuperadminShell title="Planes" description="Catálogo comercial SaaS de Medin.">
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="mb-4"><Button onClick={openCreate} variant="primary">Nuevo plan</Button></div>
      <div className="grid gap-4 lg:grid-cols-5">
        {plans.map((plan) => (
          <div key={plan.id} className={`rounded-lg border p-4 ${plan.active ? "border-clinic-line bg-white" : "border-dashed border-clinic-line bg-clinic-surface opacity-70"}`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">{plan.name}</p>
              {!plan.active && <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Inactivo</span>}
            </div>
            <p className="mt-2 text-xl font-semibold">${Number(plan.monthly_price).toLocaleString("es-AR")}</p>
            <p className="text-sm text-clinic-muted">Setup ${Number(plan.setup_price ?? 0).toLocaleString("es-AR")}</p>
            <p className="mt-3 text-sm">{plan.max_professionals ?? "∞"} profesionales · {plan.max_users ?? "∞"} usuarios</p>
            <Button className="mt-3" onClick={() => openEdit(plan)}>Editar</Button>
          </div>
        ))}
      </div>
      {(editing || creating) && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <section className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold">{creating ? "Nuevo plan" : `Editar ${editing.name}`}</h2>
            <div className="mt-4 grid gap-3">
              <label className="block text-sm font-medium">Nombre
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Precio mensual
                  <input type="number" value={form.monthly_price} onChange={(event) => setForm({ ...form, monthly_price: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
                </label>
                <label className="block text-sm font-medium">Setup
                  <input type="number" value={form.setup_price} onChange={(event) => setForm({ ...form, setup_price: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Máx. profesionales (vacío = ∞)
                  <input type="number" value={form.max_professionals} onChange={(event) => setForm({ ...form, max_professionals: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
                </label>
                <label className="block text-sm font-medium">Máx. usuarios (vacío = ∞)
                  <input type="number" value={form.max_users} onChange={(event) => setForm({ ...form, max_users: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Máx. sedes (vacío = ∞)
                  <input type="number" value={form.max_locations} onChange={(event) => setForm({ ...form, max_locations: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
                </label>
                <label className="block text-sm font-medium">Máx. pacientes (vacío = ∞)
                  <input type="number" value={form.max_patients} onChange={(event) => setForm({ ...form, max_patients: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
                </label>
              </div>
              <label className="block text-sm font-medium">Mensajes incluidos (vacío = ∞)
                <input type="number" value={form.included_messages} onChange={(event) => setForm({ ...form, included_messages: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
                Activo (aparece como opción al crear/editar una clínica)
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => { setEditing(null); setCreating(false); }}>Cancelar</Button>
              <Button disabled={saving} onClick={save} variant="primary">{saving ? "Guardando..." : "Guardar"}</Button>
            </div>
          </section>
        </div>
      )}
    </SuperadminShell>
  );
}

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
