import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, CalendarPlus, CheckCircle2, Clipboard, Clock3, Download, Home, MessageCircle, RefreshCw } from "lucide-react";

type PaymentReturnKind = "success" | "pending" | "failure";

type PaymentStatusResponse = {
  id: string;
  status: string;
  status_detail?: string | null;
  amount: number;
  currency: string;
  checkout_url: string | null;
  paid_at: string | null;
  payment_type: "deposit" | "full";
  payment_type_label: string;
  remaining_amount: number;
  private_url: string | null;
  appointment: {
    id: string | null;
    public_code?: string | null;
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
    location_name: string | null;
    location_address: string | null;
    duration_minutes: number;
    has_schedule: boolean;
  };
};

export function PaymentSuccessPage() {
  return <PaymentReturnPage kind="success" />;
}

export function PaymentPendingPage() {
  return <PaymentReturnPage kind="pending" />;
}

export function PaymentFailurePage() {
  return <PaymentReturnPage kind="failure" />;
}

function PaymentReturnPage({ kind }: { kind: PaymentReturnKind }) {
  const { search } = useLocation();
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const statusUrl = useMemo(() => {
    const params = new URLSearchParams();
    ["payment_id", "external_reference", "preference_id", "provider_preference_id", "collection_id", "provider_payment_id", "mp_payment_id"].forEach((key) => {
      const value = query.get(key);
      if (value) params.set(key, value);
    });
    return `/api/payments/mercadopago/status?${params.toString()}`;
  }, [query]);

  const load = useCallback(async (silent = false) => {
    if (!statusUrl.endsWith("?") && statusUrl.split("?")[1]) {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const response = await fetch(statusUrl);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "No pudimos consultar el pago.");
        setPayment(data);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pudimos consultar el pago.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }
    setError("No encontramos el identificador del pago.");
    setLoading(false);
  }, [statusUrl]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!payment || !["pending", "in_process"].includes(payment.status)) return;
    const interval = window.setInterval(() => load(true), 5000);
    return () => window.clearInterval(interval);
  }, [load, payment]);

  const content = resolveContent(kind, payment);
  const Icon = content.icon;
  const canUseCalendar = Boolean(payment?.appointment.has_schedule && payment.appointment.starts_at);
  const googleCalendarUrl = payment ? buildGoogleCalendarUrl(payment) : "";
  const icsUrl = payment?.appointment.id && canUseCalendar ? `/api/appointments/${payment.appointment.id}/calendar.ics` : "";
  const whatsappUrl = payment?.appointment.clinic_phone ? buildWhatsAppUrl(payment) : "";

  async function copyAppointment() {
    if (!payment) return;
    await navigator.clipboard.writeText(buildCopyText(payment));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="min-h-screen bg-clinic-surface px-4 py-8">
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-clinic-line bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-lg ${content.iconClass}`}>
            <Icon size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-clinic-muted">Medin pagos</p>
            <h1 className="mt-2 text-2xl font-semibold text-clinic-ink">{content.title}</h1>
            <p className="mt-2 text-clinic-muted">{content.description}</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-lg bg-clinic-surface p-4 text-clinic-muted">Consultando estado real del pago...</div>
        ) : error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
        ) : payment ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Detail label="Paciente" value={payment.appointment.patient_name} />
              <Detail label="Servicio" value={payment.appointment.service_name} />
              {payment.appointment.public_code && <Detail label="Código de turno" value={payment.appointment.public_code} />}
              <Detail label="Profesional" value={payment.appointment.professional_name} />
              <Detail label="Fecha y hora" value={formatDateTime(payment.appointment.starts_at, payment.appointment.timezone)} />
              <Detail label="Clínica" value={payment.appointment.clinic_name} />
              <Detail label="Sede / dirección" value={payment.appointment.location_address ?? "A confirmar"} />
              <Detail label="Monto pagado" value={formatMoney(payment.amount, payment.currency)} />
              <Detail label="Tipo de pago" value={payment.payment_type_label} />
              <Detail label="Saldo pendiente" value={formatRemaining(payment.remaining_amount, payment.currency)} />
              <Detail label="Estado del turno" value={translateAppointmentStatus(payment.appointment.status)} />
              <Detail label="Estado del pago" value={translatePaymentStatus(payment.status)} />
              <Detail label="Acreditado" value={payment.paid_at ? formatDateTime(payment.paid_at, payment.appointment.timezone) : "A confirmar"} />
            </div>

            {["pending", "in_process"].includes(payment.status) && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">Estamos confirmando tu pago.</p>
                <p className="mt-1">Te avisaremos cuando se confirme. Esta pantalla se actualiza automáticamente.</p>
              </div>
            )}

            {payment.status === "approved" && !canUseCalendar && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-semibold">{payment.payment_type === "deposit" ? "Tu seña fue acreditada." : "Tu pago fue acreditado."}</p>
                <p className="mt-1">La clínica confirmará el día y horario del turno.</p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {payment.status === "approved" && canUseCalendar && (
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
                <Clipboard size={16} /> {copied ? "Copiado" : "Copiar datos del turno"}
              </button>
              {whatsappUrl && (
                <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface" href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle size={16} /> Contactar clínica
                </a>
              )}
              {payment.private_url && (
                <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface" href={payment.private_url}>
                  Ver mi turno
                </a>
              )}
              {payment.checkout_url && payment.status !== "approved" && (
                <a className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-clinic-brand px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800" href={payment.checkout_url}>
                  Reintentar pago
                </a>
              )}
              {["pending", "in_process"].includes(payment.status) && (
                <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface disabled:opacity-60" type="button" onClick={() => load(true)} disabled={refreshing}>
                  <RefreshCw size={16} /> {refreshing ? "Actualizando..." : "Actualizar estado"}
                </button>
              )}
              <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface" to="/reservar/clinica-central">
                <Home size={16} /> Volver al inicio
              </Link>
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

function resolveContent(kind: PaymentReturnKind, payment?: PaymentStatusResponse | null) {
  if (payment?.status === "approved") {
    const isConfirmed = payment.appointment.status === "confirmed" && payment.appointment.has_schedule;
    return {
      icon: CheckCircle2,
      iconClass: "bg-emerald-50 text-emerald-700",
      title: isConfirmed ? "Tu turno está confirmado" : payment.payment_type === "deposit" ? "Tu seña fue acreditada" : "Tu pago fue acreditado",
      description: isConfirmed ? "Tu pago fue acreditado y guardamos los datos de tu turno." : "La clínica recibió tu solicitud y confirmará el turno."
    };
  }
  if (kind === "failure" || ["rejected", "cancelled", "expired"].includes(payment?.status ?? "")) {
    return {
      icon: AlertCircle,
      iconClass: "bg-red-50 text-red-700",
      title: "No pudimos confirmar el pago",
      description: "El turno queda pendiente hasta que el pago sea aprobado o la clínica confirme otro medio de pago."
    };
  }
  return {
    icon: Clock3,
    iconClass: "bg-amber-50 text-amber-700",
    title: "Tu pago está pendiente de acreditación",
    description: "Estamos confirmando tu pago con Mercado Pago. Te avisaremos cuando se confirme."
  };
}

function buildGoogleCalendarUrl(payment: PaymentStatusResponse) {
  const start = payment.appointment.starts_at ? new Date(payment.appointment.starts_at) : new Date();
  const end = payment.appointment.end_time
    ? new Date(payment.appointment.end_time)
    : new Date(start.getTime() + Number(payment.appointment.duration_minutes ?? 30) * 60_000);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Turno en ${payment.appointment.clinic_name} - ${payment.appointment.service_name}`,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    ctz: payment.appointment.timezone || "America/Argentina/Mendoza",
    location: payment.appointment.location_address ?? "",
    details: `Servicio: ${payment.appointment.service_name}\nProfesional: ${payment.appointment.professional_name}\nContacto: ${payment.appointment.clinic_phone ?? ""}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildWhatsAppUrl(payment: PaymentStatusResponse) {
  const phone = String(payment.appointment.clinic_phone ?? "").replace(/\D/g, "");
  const text = encodeURIComponent(`Hola, tengo una consulta sobre mi turno de ${payment.appointment.service_name} del ${formatDateTime(payment.appointment.starts_at, payment.appointment.timezone)}.`);
  return `https://wa.me/${phone}?text=${text}`;
}

function buildCopyText(payment: PaymentStatusResponse) {
  return [
    `Paciente: ${payment.appointment.patient_name}`,
    `Servicio: ${payment.appointment.service_name}`,
    `Profesional: ${payment.appointment.professional_name}`,
    `Fecha y hora: ${formatDateTime(payment.appointment.starts_at, payment.appointment.timezone)}`,
    `Clínica: ${payment.appointment.clinic_name}`,
    `Dirección: ${payment.appointment.location_address ?? "A confirmar"}`,
    `Monto pagado: ${formatMoney(payment.amount, payment.currency)}`,
    `Tipo de pago: ${payment.payment_type_label}`,
    `Saldo pendiente: ${formatRemaining(payment.remaining_amount, payment.currency)}`,
    `Estado del turno: ${translateAppointmentStatus(payment.appointment.status)}`,
    `Estado del pago: ${translatePaymentStatus(payment.status)}`,
    payment.private_url ? `Link privado del turno: ${payment.private_url}` : ""
  ].filter(Boolean).join("\n");
}

function translatePaymentStatus(status?: string | null) {
  const labels: Record<string, string> = {
    approved: "Aprobado",
    pending: "Pendiente",
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
    confirmed: "Confirmado",
    attended: "Atendido",
    cancelled: "Cancelado"
  };
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
