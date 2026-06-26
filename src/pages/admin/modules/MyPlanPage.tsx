import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import { useAuth } from "../../../contexts/AuthContext";
import { getClinicSubscription, getClinicUsage } from "../../../lib/subscriptions";
import { supabase } from "../../../lib/supabase";
import { AdminPageShell } from "./AdminPageShell";

type PlanRequest = { id: string; requested_plan_id: string; status: string; created_at: string };

export function MyPlanPage() {
  const { user } = useAuth();
  const { activeClinic: clinic, loading: clinicLoading } = useActiveClinic();
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PlanRequest[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [requestingPlanId, setRequestingPlanId] = useState("");

  async function load() {
    if (!clinic) return;
    setError("");
    const [sub, currentUsage, available, requests] = await Promise.all([
      getClinicSubscription(clinic.id),
      getClinicUsage(clinic.id),
      supabase.from("subscription_plans").select("*").eq("active", true).order("monthly_price"),
      supabase.from("plan_change_requests").select("id, requested_plan_id, status, created_at").eq("clinic_id", clinic.id).eq("status", "pending").order("created_at", { ascending: false })
    ]);
    if (available.error) throw available.error;
    if (requests.error) throw requests.error;
    setSubscription(sub);
    setUsage(currentUsage);
    setPlans(available.data ?? []);
    setPendingRequests((requests.data ?? []) as PlanRequest[]);
  }

  useEffect(() => { if (clinic) load().catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar tu plan.")); }, [clinic?.id]);

  const pendingPlanIds = useMemo(() => new Set(pendingRequests.map((request) => request.requested_plan_id)), [pendingRequests]);

  async function requestPlan(planId: string) {
    if (!clinic || !user || pendingPlanIds.has(planId)) return;
    setRequestingPlanId(planId); setError(""); setNotice("");
    try {
      const { data, error: insertError } = await supabase.from("plan_change_requests")
        .insert({ clinic_id: clinic.id, current_plan_id: subscription?.plan_id ?? null, requested_plan_id: planId, requested_by: user.id })
        .select("id, requested_plan_id, status, created_at").single();
      if (insertError) throw insertError;
      setPendingRequests((current) => [data as PlanRequest, ...current]);
      const { error: auditError } = await supabase.from("audit_logs").insert({ clinic_id: clinic.id, user_id: user.id, action: "plan_change_requested", entity_type: "plan_change_request", entity_id: data.id, metadata: { requested_plan_id: planId } });
      if (auditError) console.error("Failed to audit plan request", auditError);
      setNotice("Solicitud enviada a Medin. Te contactaremos para coordinar el cambio.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos enviar la solicitud. Revisá tus permisos e intentá nuevamente.");
    } finally { setRequestingPlanId(""); }
  }

  const plan = subscription?.subscription_plans;
  return <AdminPageShell title="Mi plan" eyebrow="Suscripción Medin" description="Plan SaaS, límites de uso y solicitudes comerciales." onRefresh={load}>
    {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {!clinic && !clinicLoading && <NoActiveClinicState />}
    {clinic && <>
    {pendingRequests.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">Tenés una solicitud de cambio de plan pendiente de revisión.</div>}
    <section className="grid gap-4 lg:grid-cols-3"><SectionCard className="p-5"><p className="text-sm text-clinic-muted">Plan actual</p><h2 className="mt-2 text-2xl font-semibold">{plan?.name ?? "Sin plan"}</h2><p className="mt-2 text-sm text-clinic-muted">Estado: {subscription?.status ?? "pendiente"}</p></SectionCard><SectionCard className="p-5"><p className="text-sm text-clinic-muted">Setup</p><p className="mt-2 text-xl font-semibold">{subscription?.setup_fee_status ?? "pending"}</p><p className="mt-3 text-sm text-clinic-muted">Mensualidad: {subscription?.monthly_fee_status ?? "pending"}</p></SectionCard><SectionCard className="p-5"><p className="text-sm text-clinic-muted">Soporte comercial</p><Button className="mt-3" onClick={() => window.location.href = "mailto:soporte@medin.com.ar?subject=Consulta%20sobre%20mi%20plan"}>Contactar soporte</Button></SectionCard></section>
    <SectionCard className="p-5"><h2 className="font-semibold">Uso actual</h2><div className="mt-4 grid gap-3 md:grid-cols-3">{usage && [["Profesionales",usage.professionals,plan?.max_professionals],["Usuarios",usage.users,plan?.max_users],["Sedes",usage.locations,plan?.max_locations],["Pacientes",usage.patients,plan?.max_patients],["Servicios",usage.services,plan?.max_services],["Mensajes",usage.messages,plan?.included_messages]].map(([label,current,limit]: any) => <div key={label} className={`rounded-lg border p-3 ${limit && current > limit ? "border-red-200 bg-red-50" : "border-clinic-line"}`}><p className="text-sm text-clinic-muted">{label}</p><p className="mt-1 font-semibold">{current} / {limit ?? "Ilimitado"}</p></div>)}</div></SectionCard>
    <h2 className="text-xl font-semibold">Planes disponibles</h2><section className="grid gap-4 lg:grid-cols-5">{plans.map((item) => { const pending = pendingPlanIds.has(item.id); const current = item.id === subscription?.plan_id; return <SectionCard key={item.id} className="p-4"><p className="font-semibold">{item.name}{item.recommended && <span className="ml-2 rounded bg-teal-50 px-2 py-1 text-xs text-clinic-brand">Más recomendado</span>}</p><p className="mt-3 text-lg font-semibold">{item.custom_pricing ? "A medida" : `$${Number(item.monthly_price).toLocaleString("es-AR")} / mes`}</p><p className="mt-1 text-xs text-clinic-muted">Setup: ${Number(item.setup_price ?? 0).toLocaleString("es-AR")}</p><p className="mt-3 text-sm text-clinic-muted">{item.max_professionals ?? "∞"} profesionales · {item.max_users ?? "∞"} usuarios</p>{pending && <p className="mt-3 rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Solicitud pendiente</p>}<Button className="mt-4" disabled={current || pending || requestingPlanId === item.id} onClick={() => requestPlan(item.id)}>{current ? "Plan actual" : pending ? "Pendiente de revisión" : requestingPlanId === item.id ? "Enviando..." : "Solicitar cambio"}</Button></SectionCard>; })}</section><Link to="/admin/configuracion" className="text-sm font-semibold text-clinic-brand">Ver configuración de clínica</Link>
    </>}
  </AdminPageShell>;
}
