import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarPlus, Clipboard, Download, Home, MessageCircle, RefreshCw, Send } from "lucide-react";

type PublicAppointmentResponse = {
  appointment: {
    status: string | null;
    payment_status: string | null;
    starts_at: string | null;
    end_time: string | null;
    patient_name: string;
    service_name: string;
    professional_name: string;
    clinic_name: string;
    timezone: string;
    clinic_phone: string | null;
    location_address: string | null;
    duration_minutes: number;
    has_schedule: boolean;
  };
  payment: {
    status: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    payment_type: "deposit" | "full";
    payment_type_label: string;
    remaining_amount: number;
  } | null;
  pending_requests: Array<{
    type: RequestType;
    status: string;
    created_at: string;
  }>;
};

type RequestType = "cancellation" | "reschedule";

export function PublicAppointmentPage() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicAppointmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [requestType, setRequestType] = useState<RequestType | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestSent, setRequestSent] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/appointments/public/${encodeURIComponent(token)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No pudimos encontrar este turno.");
      setData(body);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos encontrar este turno.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    document.title = "Medin | Mi turno";
    load();
  }, [load]);

  const canUseCalendar = Boolean(data?.appointment.has_schedule && data.appointment.starts_at);
  const googleCalendarUrl = data ? buildGoogleCalendarUrl(data) : "";
  const icsUrl = canUseCalendar ? `/api/appointments/public/${encodeURIComponent(token)}/calendar.ics` : "";
  const whatsappUrl = data?.appointment.clinic_phone ? buildWhatsAppUrl(data) : "";
  const pendingRequestTypes = new Set((data?.pending_requests ?? []).map((request) => request.type));

  async function copyAppointment() {
    if (!data) return;
    await navigator.clipboard.writeText(buildCopyText(data));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function submitRequest() {
    if (!requestType) return;
    try {
      setSubmitting(true);
      const response = await fetch(`/api/appointments/public/${encodeURIComponent(token)}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: requestType, notes: notes.trim() || null })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error === "DUPLICATE_PENDING_REQUEST" ? "Ya existe una solicitud pendiente de ese tipo." : body.error ?? "No pudimos enviar la solicitud.");
      }
      setRequestSent("Solicitud enviada. La clínica debe aprobar el cambio antes de modificar el turno.");
      setRequestType(null);
      setNotes("");
      await load();
    } catch (err) {
      setRequestSent(err instanceof Error ? err.message : "No pudimos enviar la solicitud.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-clinic-surface px-4 py-8">
      <section className="mx-auto w-full max-w-4xl rounded-lg border border-clinic-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-clinic-muted">Medin</p>
            <h1 className="mt-2 text-2xl font-semibold text-clinic-ink">Mi turno</h1>
            <p className="mt-2 max-w-2xl text-clinic-muted">Consultá los datos operativos de tu reserva y pago. Este acceso no muestra historia clínica ni información médica sensible.</p>
          </div>
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface disabled:opacity-60" type="button" onClick={load} disabled={loading}>
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>

        {loading ? (
          <div className="mt-6 rounded-lg bg-clinic-surface p-4 text-clinic-muted">Cargando turno...</div>
        ) : error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
        ) : data ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Detail label="Paciente" value={data.appointment.patient_name} />
              <Detail label="Servicio" value={data.appointment.service_name} />
              <Detail label="Profesional" value={data.appointment.professional_name} />
              <Detail label="Fecha y hora" value={formatDateTime(data.appointment.starts_at, data.appointment.timezone)} />
              <Detail label="Clínica" value={data.appointment.clinic_name} />
              <Detail label="Dirección" value={data.appointment.location_address ?? "A confirmar"} />
              <Detail label="Estado del turno" value={translateAppointmentStatus(data.appointment.status)} />
              <Detail label="Estado del pago" value={translatePaymentStatus(data.payment?.status ?? data.appointment.payment_status)} />
              <Detail label="Monto pagado" value={data.payment ? formatMoney(data.payment.amount, data.payment.currency) : "Sin pago registrado"} />
              <Detail label="Tipo de pago" value={data.payment?.payment_type_label ?? "A confirmar"} />
              <Detail label="Saldo pendiente" value={data.payment ? formatRemaining(data.payment.remaining_amount, data.payment.currency) : "A confirmar"} />
              <Detail label="Acreditado" value={data.payment?.paid_at ? formatDateTime(data.payment.paid_at, data.appointment.timezone) : "A confirmar"} />
            </div>

            {!canUseCalendar && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                La clínica confirmará el día y horario del turno antes de habilitar el calendario.
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {canUseCalendar && (
                <a className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" href={googleCalendarUrl} target="_blank" rel="noreferrer">
                  <CalendarPlus size={16} /> Agregar a Google Calendar
                </a>
              )}
              {icsUrl && (
                <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface" href={icsUrl}>
                  <Download size={16} /> Descargar evento .ics
                </a>
              )}
              <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface" type="button" onClick={copyAppointment}>
                <Clipboard size={16} /> {copied ? "Copiado" : "Copiar datos"}
              </button>
              {whatsappUrl && (
                <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface" href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle size={16} /> Contactar clínica
                </a>
              )}
              <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface" to="/reservar/clinica-central">
                <Home size={16} /> Volver
              </Link>
            </div>

            <div className="mt-8 rounded-lg border border-clinic-line bg-clinic-surface p-4">
              <h2 className="text-base font-semibold text-clinic-ink">Solicitudes</h2>
              <p className="mt-1 text-sm text-clinic-muted">Podés pedir cancelación o reprogramación. La clínica debe aprobar el cambio antes de modificar el turno.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={`rounded-lg border px-4 py-2 text-sm font-semibold ${requestType === "reschedule" ? "border-clinic-brand bg-white text-clinic-brand" : "border-clinic-line bg-white text-clinic-ink"}`} type="button" onClick={() => setRequestType("reschedule")}>
                  {pendingRequestTypes.has("reschedule") ? "Reprogramación solicitada" : "Solicitar reprogramación"}
                </button>
                <button className={`rounded-lg border px-4 py-2 text-sm font-semibold ${requestType === "cancellation" ? "border-red-300 bg-white text-red-700" : "border-clinic-line bg-white text-clinic-ink"}`} type="button" onClick={() => setRequestType("cancellation")}>
                  {pendingRequestTypes.has("cancellation") ? "Cancelación solicitada" : "Solicitar cancelación"}
                </button>
              </div>
              {requestType && (
                <div className="mt-4">
                  <textarea className="min-h-28 w-full rounded-lg border border-clinic-line px-3 py-2 text-sm outline-none focus:border-clinic-brand" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Agregá un comentario opcional para la clínica." />
                  {pendingRequestTypes.has(requestType) ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                      Ya existe una solicitud pendiente de este tipo.
                    </div>
                  ) : (
                    <button className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60" type="button" onClick={submitRequest} disabled={submitting}>
                      <Send size={16} /> {submitting ? "Enviando..." : "Enviar solicitud"}
                    </button>
                  )}
                </div>
              )}
              {requestSent && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{requestSent}</div>}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-clinic-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-clinic-ink">{value}</p>
    </div>
  );
}

function buildGoogleCalendarUrl(data: PublicAppointmentResponse) {
  const start = data.appointment.starts_at ? new Date(data.appointment.starts_at) : new Date();
  const end = data.appointment.end_time
    ? new Date(data.appointment.end_time)
    : new Date(start.getTime() + Number(data.appointment.duration_minutes ?? 30) * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Turno en ${data.appointment.clinic_name} - ${data.appointment.service_name}`,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    ctz: data.appointment.timezone || "America/Argentina/Mendoza",
    location: data.appointment.location_address ?? "",
    details: `Servicio: ${data.appointment.service_name}\nProfesional: ${data.appointment.professional_name}\nContacto: ${data.appointment.clinic_phone ?? ""}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildWhatsAppUrl(data: PublicAppointmentResponse) {
  const phone = String(data.appointment.clinic_phone ?? "").replace(/\D/g, "");
  const text = encodeURIComponent(`Hola, tengo una consulta sobre mi turno de ${data.appointment.service_name} del ${formatDateTime(data.appointment.starts_at, data.appointment.timezone)}.`);
  return `https://wa.me/${phone}?text=${text}`;
}

function buildCopyText(data: PublicAppointmentResponse) {
  return [
    `Paciente: ${data.appointment.patient_name}`,
    `Servicio: ${data.appointment.service_name}`,
    `Profesional: ${data.appointment.professional_name}`,
    `Fecha y hora: ${formatDateTime(data.appointment.starts_at, data.appointment.timezone)}`,
    `Clínica: ${data.appointment.clinic_name}`,
    `Dirección: ${data.appointment.location_address ?? "A confirmar"}`,
    `Estado del turno: ${translateAppointmentStatus(data.appointment.status)}`,
    `Estado del pago: ${translatePaymentStatus(data.payment?.status ?? data.appointment.payment_status)}`
  ].join("\n");
}

function translatePaymentStatus(status?: string | null) {
  const labels: Record<string, string> = {
    approved: "Aprobado",
    deposit_paid: "Seña pagada",
    paid: "Pagado",
    pending: "Pendiente",
    deposit_pending: "Seña pendiente",
    in_process: "En proceso",
    rejected: "Rechazado",
    cancelled: "Cancelado",
    refunded: "Reintegrado",
    charged_back: "Contracargo",
    expired: "Expirado"
  };
  return labels[status ?? ""] ?? status ?? "Sin estado";
}

function translateAppointmentStatus(status?: string | null) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    pending_confirmation: "Pendiente de confirmación",
    confirmed: "Confirmado",
    attended: "Atendido",
    completed: "Atendido",
    no_show: "No asistió",
    cancelled: "Cancelado"
  };
  if (status === "pending") return "Pendiente de confirmación";
  return labels[status ?? ""] ?? status ?? "Sin estado";
}

function formatDateTime(value?: string | null, timezone = "America/Argentina/Mendoza") {
  if (!value) return "A confirmar";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}

function formatMoney(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency }).format(Number(value ?? 0));
}

function formatRemaining(value: number, currency = "ARS") {
  return Number(value ?? 0) <= 0 ? "Sin saldo pendiente" : formatMoney(value, currency);
}

function toGoogleDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
