import { useEffect, useMemo, useState } from "react";
import { Bell, CalendarDays, CheckCircle2, Mail, MessageCircle, Monitor, RefreshCw, Search, Send } from "lucide-react";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import { useAuth } from "../../../contexts/AuthContext";
import { getNotificationEvents } from "../../../lib/notifications";
import { supabase } from "../../../lib/supabase";
import { NotificationDelivery, NotificationEvent } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

type NotificationFilter = "all" | "pending" | "processed" | "failed";

const filterLabels: Record<NotificationFilter, string> = {
  all: "Todas",
  pending: "Pendientes",
  processed: "Procesadas",
  failed: "Fallidas"
};

export function NotificationsPage() {
  const { role } = useAuth();
  const { activeClinic: clinic, activeRole, loading: clinicLoading } = useActiveClinic();
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processNotice, setProcessNotice] = useState("");
  // El procesamiento de emails es global (todas las clinicas), no depende
  // de tener una clinica activa seleccionada: no gatear por `clinic`.
  const canProcessEmails = (activeRole ?? role) === "platform_admin";

  async function load() {
    if (!clinic) return;
    setLoading(true);
    setError("");
    try {
      setEvents(await getNotificationEvents(clinic.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar las notificaciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (clinic) load();
    else if (!clinicLoading) setLoading(false);
  }, [clinic?.id, clinicLoading]);

  // Estas cards miden el estado del EVENTO (notification_events.status), no
  // el estado de la entrega de email. Un evento puede seguir "pending" aunque
  // su email ya se haya enviado: nada actualiza notification_events.status al
  // procesar un delivery individual. Para el estado real de los emails, ver
  // emailDeliveryMetrics mas abajo.
  const metrics = useMemo(() => ({
    all: events.length,
    pending: events.filter((event) => event.status === "pending").length,
    processed: events.filter((event) => event.status === "processed").length,
    failed: events.filter((event) => event.status === "failed").length
  }), [events]);

  const emailDeliveryMetrics = useMemo(() => {
    const emailDeliveries = events.flatMap((event) => event.notification_deliveries ?? []).filter((delivery) => delivery.channel === "email");
    return {
      pending: emailDeliveries.filter((delivery) => delivery.status === "pending").length,
      sent: emailDeliveries.filter((delivery) => delivery.status === "sent").length,
      failed: emailDeliveries.filter((delivery) => delivery.status === "failed").length,
      skipped: emailDeliveries.filter((delivery) => delivery.status === "skipped").length
    };
  }, [events]);

  const visibleEvents = useMemo(() => {
    const filtered = filter === "all" ? events : events.filter((event) => event.status === filter);
    const query = search.trim().toLowerCase();
    if (!query) return filtered;
    return filtered.filter((event) => [
      event.title,
      event.message,
      event.event_type,
      event.patients ? `${event.patients.first_name} ${event.patients.last_name}` : "",
      event.appointments?.public_code
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [events, filter, search]);

  function changeFilter(next: NotificationFilter) {
    setFilter(next);
  }

  async function processEmails() {
    setProcessing(true);
    setProcessNotice("");
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sesion expirada.");
      const response = await fetch("/api/notifications/process-email-deliveries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify({ limit: 25 })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = result.error === "PLATFORM_ADMIN_REQUIRED"
          ? "Solo un administrador de plataforma puede procesar emails pendientes."
          : result.error === "UNAUTHORIZED"
            ? "Sesion expirada. Volve a iniciar sesion."
            : "No pudimos procesar los emails pendientes.";
        throw new Error(message);
      }
      setProcessNotice(`Procesados: ${result.processed ?? 0}. Enviados: ${result.sent ?? 0}. Fallidos: ${result.failed ?? 0}. Omitidos: ${result.skipped ?? 0}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos procesar los emails pendientes.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <AdminPageShell
      description="Eventos internos, entregas preparadas y trazabilidad para email, WhatsApp futuro y avisos en la plataforma."
      eyebrow="Comunicación"
      onRefresh={() => load()}
      title="Notificaciones"
    >
      {error && <Message tone="error">{error}</Message>}
      {processNotice && <Message tone="success">{processNotice}</Message>}
      {!clinic && !clinicLoading && <NoActiveClinicState />}

      {canProcessEmails && (
        <SectionCard className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-clinic-ink">Entregas de email pendientes</h2>
            <p className="mt-1 text-sm text-clinic-muted">
              Envia por Resend las notificaciones transaccionales con estado pendiente, de todas las clinicas.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-clinic-muted">
              <span>Emails pendientes: {emailDeliveryMetrics.pending}</span>
              <span className="text-emerald-700">Emails enviados: {emailDeliveryMetrics.sent}</span>
              {emailDeliveryMetrics.failed > 0 && <span className="text-red-700">Emails fallidos: {emailDeliveryMetrics.failed}</span>}
            </div>
            {emailDeliveryMetrics.pending === 0 && (
              <p className="mt-1 text-xs font-medium text-clinic-muted">No hay emails pendientes en esta clínica.</p>
            )}
          </div>
          <Button
            variant="primary"
            icon={<Send size={16} />}
            disabled={processing}
            onClick={() => processEmails()}
          >
            {processing ? "Procesando..." : "Procesar emails pendientes"}
          </Button>
        </SectionCard>
      )}

      {clinic && <section className="grid gap-4 md:grid-cols-4">
        {(Object.keys(filterLabels) as NotificationFilter[]).map((item) => (
          <button
            key={item}
            onClick={() => changeFilter(item)}
            title="Estado del evento interno, no del email: un evento puede seguir 'pendiente' aunque su email ya se haya enviado."
            className={`rounded-xl border p-4 text-left shadow-sm transition ${
              filter === item ? "border-clinic-brand bg-teal-50 text-clinic-brand" : "border-clinic-line bg-white text-clinic-ink hover:bg-clinic-surface"
            }`}
          >
            <p className="text-sm font-medium">Eventos: {filterLabels[item]}</p>
            <p className="mt-2 text-2xl font-semibold">{metrics[item]}</p>
          </button>
        ))}
      </section>}

      {clinic && <SectionCard className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-lg border border-clinic-line py-2 pl-9 pr-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              placeholder="Buscar por evento, paciente, código MED o mensaje"
            />
          </label>
          <Button icon={<RefreshCw size={16} />} onClick={() => load()}>
            Actualizar
          </Button>
        </div>
      </SectionCard>}

      {clinic && <SectionCard className="overflow-hidden">
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Eventos registrados</h2>
          <p className="mt-1 text-sm text-clinic-muted">WhatsApp queda preparado como entrega futura; hoy solo se procesan emails pendientes.</p>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">Cargando notificaciones...</div>
        ) : visibleEvents.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">No hay notificaciones para este filtro.</div>
        ) : (
          <div className="divide-y divide-clinic-line">
            {visibleEvents.map((event) => (
              <article key={event.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)_170px_120px] lg:items-start">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
                    <Bell size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-clinic-muted">{event.event_type}</p>
                    <p className="mt-1 text-sm text-clinic-muted">{formatDate(event.created_at)}</p>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-clinic-ink">{event.title}</p>
                  {event.message && <p className="mt-1 text-sm text-clinic-muted">{event.message}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-clinic-muted">
                    {event.patients && <span>Paciente: {event.patients.first_name} {event.patients.last_name}</span>}
                    {event.appointments?.public_code && <span>Código: {event.appointments.public_code}</span>}
                  </div>
                  {event.notification_deliveries && event.notification_deliveries.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {event.notification_deliveries.map((delivery) => (
                        <DeliveryPill key={delivery.id} delivery={delivery} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 items-center gap-2 text-sm text-clinic-muted">
                  <CalendarDays size={16} className="shrink-0" />
                  <span className="truncate">{event.appointments?.starts_at ? formatDate(event.appointments.starts_at) : "Sin turno asociado"}</span>
                </div>
                <div>
                  <StatusPill status={event.status} />
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>}
    </AdminPageShell>
  );
}

function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = {
    pending: "Pendiente",
    processed: "Procesada",
    failed: "Fallida",
    cancelled: "Cancelada"
  };
  const tone = status === "processed"
    ? "bg-emerald-50 text-emerald-700"
    : status === "failed"
      ? "bg-red-50 text-red-700"
      : status === "cancelled"
        ? "bg-slate-100 text-slate-700"
        : "bg-amber-50 text-amber-700";
  return <span className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold ${tone}`}><CheckCircle2 size={14} />{label[status] ?? status}</span>;
}

function DeliveryPill({ delivery }: { delivery: NotificationDelivery }) {
  const Icon = delivery.channel === "email" ? Mail : delivery.channel === "whatsapp" ? MessageCircle : Monitor;
  const channelLabel: Record<string, string> = {
    email: "Email",
    whatsapp: "WhatsApp",
    in_app: "Plataforma"
  };
  const statusLabel: Record<string, string> = {
    pending: "Pendiente",
    sent: "Enviado",
    failed: "Fallido",
    skipped: "Omitido"
  };
  const tone = delivery.status === "sent"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : delivery.status === "failed"
      ? "border-red-200 bg-red-50 text-red-700"
      : delivery.status === "skipped"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-amber-200 bg-amber-50 text-amber-700";

  const statusText = delivery.channel === "whatsapp" && delivery.status === "pending"
    ? "Pendiente futuro"
    : statusLabel[delivery.status] ?? delivery.status;

  return (
    <span title={delivery.error_message ?? delivery.recipient_email ?? undefined} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <Icon size={13} />
      {channelLabel[delivery.channel] ?? delivery.channel}: {statusText}
    </span>
  );
}

function Message({ tone, children }: { tone: "error" | "success"; children: string }) {
  const toneClasses = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${toneClasses}`}>{children}</div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Mendoza"
  }).format(new Date(value));
}
