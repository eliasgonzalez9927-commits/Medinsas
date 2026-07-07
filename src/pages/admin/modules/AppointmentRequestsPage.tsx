import { ReactNode, useEffect, useMemo, useState } from "react";
import { useAutoRefresh } from "../../../hooks/useAutoRefresh";
import { CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { Button } from "../../../components/ui/Button";
import { supabase } from "../../../lib/supabase";
import { DateRangeValue, isDateInRange, resolveDateRange } from "../../../lib/date-range";
import { AdminPageShell } from "./AdminPageShell";

type AppointmentRequest = {
  id: string;
  type: "cancellation" | "reschedule";
  status: "pending" | "approved" | "rejected" | "cancelled" | "managed";
  notes: string | null;
  requested_by: string;
  created_at: string;
  appointment: {
    id: string;
    status: string | null;
    starts_at: string | null;
    patient_name: string;
    service_name: string;
    professional_name: string;
    clinic_name: string;
    timezone: string;
    location_address: string | null;
  };
};

export function AppointmentRequestsPage() {
  const [requests, setRequests] = useState<AppointmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("last_30_days"));
  const [dateField, setDateField] = useState<"created" | "appointment">("created");

  async function loadRequests() {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/appointment-requests", {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No pudimos cargar las solicitudes.");
      setRequests(body.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar las solicitudes.");
    } finally {
      setLoading(false);
    }
  }

  // Soft refresh: actualiza datos sin spinner bloqueante.
  async function softLoadRequests() {
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/appointment-requests", {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Error al actualizar solicitudes.");
      setRequests(body.requests ?? []);
    } catch {
      // Fallo silencioso: mantiene datos existentes.
    }
  }

  const { lastRefreshedAt, isRefreshing, isOnline, refresh } = useAutoRefresh(softLoadRequests, {
    intervalMs: 60_000,
    pauseWhenHidden: true,
  });

  useEffect(() => {
    document.title = "Medin | Solicitudes";
    loadRequests();
  }, []);

  const visibleRequests = useMemo(() => requests.filter((request) => {
    if (request.status === "pending") return true;
    const reference = dateField === "appointment" ? request.appointment.starts_at : request.created_at;
    return isDateInRange(reference, range, request.appointment.timezone);
  }), [dateField, range, requests]);

  const metrics = useMemo(() => ({
    pending: visibleRequests.filter((item) => item.status === "pending").length,
    cancellations: visibleRequests.filter((item) => item.type === "cancellation" && item.status === "pending").length,
    reschedules: visibleRequests.filter((item) => item.type === "reschedule" && item.status === "pending").length
  }), [visibleRequests]);

  async function updateRequest(id: string, action: "approve_cancellation" | "reject" | "mark_managed") {
    setSavingId(id);
    setError("");
    setNotice("");
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/appointment-requests/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ action })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No pudimos actualizar la solicitud.");
      setNotice("Solicitud actualizada.");
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar la solicitud.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <AdminPageShell
      description="Solicitudes iniciadas desde el link privado del turno. La reprogramación queda como gestión manual hasta conectar agenda/disponibilidad."
      eyebrow="Acceso paciente"
      onRefresh={refresh}
      lastRefreshedAt={lastRefreshedAt}
      isRefreshing={isRefreshing}
      isOnline={isOnline}
      title="Solicitudes de pacientes"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}

      <div className="grid gap-4 xl:grid-cols-[1fr_220px]">
        <DateRangeFilter defaultPreset="last_30_days" onChange={setRange} />
        <label className="rounded-lg border border-clinic-line bg-white p-4 text-sm font-medium text-clinic-ink shadow-sm">Filtrar por<select value={dateField} onChange={(event) => setDateField(event.target.value as "created" | "appointment")} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm"><option value="created">Fecha de solicitud</option><option value="appointment">Fecha del turno</option></select></label>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<ClipboardCheck size={18} />} label="Pendientes" value={metrics.pending} />
        <Metric icon={<XCircle size={18} />} label="Cancelaciones" value={metrics.cancellations} />
        <Metric icon={<RefreshCw size={18} />} label="Reprogramaciones" value={metrics.reschedules} />
      </section>

      <SectionCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clinic-line px-5 py-4">
          <div>
            <h2 className="font-semibold text-clinic-ink">Bandeja de solicitudes</h2>
            <p className="text-sm text-clinic-muted">Aprobá cancelaciones, rechazá pedidos o marcá reprogramaciones como gestionadas.</p>
          </div>
          <Button icon={<RefreshCw size={16} />} onClick={loadRequests}>Actualizar</Button>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">Cargando solicitudes...</div>
        ) : visibleRequests.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">No hay solicitudes para el período seleccionado.</div>
        ) : (
          <div className="divide-y divide-clinic-line">
            {visibleRequests.map((request) => (
              <article key={request.id} className="grid gap-4 px-5 py-4 xl:grid-cols-[1.2fr_1.2fr_170px_260px] xl:items-center">
                <div>
                  <p className="font-semibold text-clinic-ink">{request.appointment.patient_name}</p>
                  <p className="text-sm text-clinic-muted">{request.appointment.service_name}</p>
                  <p className="text-sm text-clinic-muted">Dr/a. {request.appointment.professional_name}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-clinic-ink">Turno: {formatDateTime(request.appointment.starts_at, request.appointment.timezone)}</p>
                  <p className="text-sm text-clinic-muted">Solicitud: {formatDateTime(request.created_at, request.appointment.timezone)}</p>
                  {request.notes && <p className="mt-1 text-sm text-clinic-muted">Nota: {request.notes}</p>}
                </div>
                <div className="grid gap-2">
                  <span className="rounded-lg bg-clinic-surface px-2.5 py-1 text-center text-xs font-semibold text-clinic-ink">{requestTypeLabel(request.type)}</span>
                  <StatusBadge status={request.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {request.status === "pending" && request.type === "cancellation" && (
                    <Button icon={<CheckCircle2 size={16} />} onClick={() => updateRequest(request.id, "approve_cancellation")} disabled={savingId === request.id}>
                      Aprobar cancelación
                    </Button>
                  )}
                  {request.status === "pending" && request.type === "reschedule" && (
                    <Button onClick={() => updateRequest(request.id, "mark_managed")} disabled={savingId === request.id}>
                      Marcar gestionada
                    </Button>
                  )}
                  {request.status === "pending" && (
                    <Button icon={<XCircle size={16} />} onClick={() => updateRequest(request.id, "reject")} disabled={savingId === request.id}>
                      Rechazar
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">{icon}</div>
      <div>
        <p className="text-2xl font-semibold text-clinic-ink">{value}</p>
        <p className="text-sm text-clinic-muted">{label}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AppointmentRequest["status"] }) {
  const tone = status === "pending"
    ? "bg-amber-50 text-amber-700"
    : status === "approved" || status === "managed"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-red-50 text-red-700";
  return <span className={`rounded-lg px-2.5 py-1 text-center text-xs font-semibold ${tone}`}>{requestStatusLabel(status)}</span>;
}

function Message({ tone, children }: { tone: "success" | "error"; children: string }) {
  const className = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}

function requestTypeLabel(type: AppointmentRequest["type"]) {
  return type === "cancellation" ? "Cancelación" : "Reprogramación";
}

function requestStatusLabel(status: AppointmentRequest["status"]) {
  const labels: Record<AppointmentRequest["status"], string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
    managed: "Gestionada"
  };
  return labels[status] ?? status;
}

function formatDateTime(value?: string | null, timezone = "America/Argentina/Mendoza") {
  if (!value) return "A confirmar";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
