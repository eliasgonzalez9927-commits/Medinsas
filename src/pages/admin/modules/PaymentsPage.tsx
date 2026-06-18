import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CreditCard, ExternalLink, RefreshCw, Settings, WalletCards } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import {
  getDefaultClinic,
  getPaymentById,
  getPaymentEvents,
  getPayments,
  getPaymentSettings,
  updatePaymentSettings
} from "../../../lib/clinic-data";
import { supabase } from "../../../lib/supabase";
import { Clinic, PaymentEvent, PaymentSettings, PaymentWithRelations } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

const appUrl = "https://clinic-saas-mvp.vercel.app";

type EnvHealth = {
  mercadoPagoAccessToken: boolean;
  mercadoPagoPublicKey: boolean;
  mercadoPagoWebhookSecret: boolean;
  mercadoPagoEnv: boolean;
  appPublicUrl: boolean;
  supabaseUrl: boolean;
  supabaseServiceRoleKey: boolean;
};

export function PaymentsPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [payments, setPayments] = useState<PaymentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) return;
      setPayments(await getPayments(loadedClinic.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los pagos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const approved = payments.filter((payment) => getEffectivePaymentStatus(payment) === "approved");
    const pending = payments.filter((payment) => ["pending", "in_process"].includes(getEffectivePaymentStatus(payment)));
    const expired = payments.filter((payment) => getEffectivePaymentStatus(payment) === "expired");
    return {
      total: payments.length,
      approved: approved.length,
      pending: pending.length,
      expired: expired.length,
      amount: approved.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
    };
  }, [payments]);

  async function syncPayment(paymentId: string) {
    setSyncingId(paymentId);
    setError("");
    try {
      await syncPaymentStatus(paymentId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar el estado.");
    } finally {
      setSyncingId("");
    }
  }

  return (
    <AdminPageShell
      description="Links de pago, señas, pagos de turnos y trazabilidad con Mercado Pago."
      eyebrow="Finanzas"
      onRefresh={load}
      title="Pagos"
    >
      {error && <Message tone="error">{error}</Message>}
      <section className="grid gap-4 md:grid-cols-5">
        <Metric label="Pagos" value={String(summary.total)} />
        <Metric label="Aprobados" value={String(summary.approved)} />
        <Metric label="Pendientes" value={String(summary.pending)} />
        <Metric label="Vencidos" value={String(summary.expired)} />
        <Metric label="Cobrado" value={formatMoney(summary.amount)} />
      </section>

      <SectionCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Listado de pagos</h2>
          <Link to="/admin/pagos/configuracion" className="text-sm font-semibold text-clinic-brand">Configurar Mercado Pago</Link>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-clinic-muted">Cargando pagos...</p>
        ) : payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-clinic-muted">Todavia no hay pagos registrados.</p>
        ) : (
          <div className="divide-y divide-clinic-line">
            {payments.map((payment) => (
              <article key={payment.id} className="grid gap-3 px-5 py-4 xl:grid-cols-[1.2fr_1.2fr_120px_120px_110px_110px_150px] xl:items-center">
                <div>
                  <p className="font-semibold text-clinic-ink">
                    {payment.patients ? `${payment.patients.first_name} ${payment.patients.last_name}` : "Sin paciente"}
                  </p>
                  <p className="text-sm text-clinic-muted">{payment.services?.name ?? payment.notes ?? "Pago Mercado Pago"}</p>
                </div>
                <div className="text-sm text-clinic-muted">
                  <p><span className="font-semibold text-clinic-ink">Turno:</span> {payment.appointments?.starts_at ? formatDate(payment.appointments.starts_at, payment.clinics?.timezone ?? undefined) : "Sin fecha"}</p>
                  <p><span className="font-semibold text-clinic-ink">Pago:</span> {formatDate(payment.paid_at ?? payment.created_at, payment.clinics?.timezone ?? undefined)}</p>
                </div>
                <StatusBadge status={getEffectivePaymentStatus(payment)} />
                <span className="text-sm font-semibold text-clinic-ink">{formatMoney(payment.amount)}</span>
                <span className="text-sm text-clinic-muted">{getPaymentKind(payment).label}</span>
                <span className="text-sm text-clinic-muted">{payment.provider ?? "manual"}</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-clinic-line px-3 py-1.5 text-xs font-semibold text-clinic-ink hover:bg-clinic-surface disabled:opacity-60"
                    disabled={syncingId === payment.id}
                    onClick={() => syncPayment(payment.id)}
                    type="button"
                  >
                    <RefreshCw size={14} /> {syncingId === payment.id ? "Actualizando" : "Actualizar estado"}
                  </button>
                  <Link className="inline-flex min-h-9 items-center rounded-lg px-2 py-1.5 text-sm font-semibold text-clinic-brand" to={`/admin/pagos/${payment.id}`}>Ver</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
}

export function PaymentDetailPage() {
  const { id = "" } = useParams();
  const [payment, setPayment] = useState<PaymentWithRelations | null>(null);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncing, setSyncing] = useState(false);

  async function load() {
    try {
      const loadedPayment = await getPaymentById(id);
      setPayment(loadedPayment);
      if (loadedPayment) setEvents(await getPaymentEvents(loadedPayment.id).catch(() => []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar el pago.");
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function syncCurrentPayment() {
    if (!payment) return;
    setSyncing(true);
    setNotice("");
    setError("");
    try {
      await syncPaymentStatus(payment.id);
      setNotice("Estado actualizado desde Mercado Pago.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar el estado.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <AdminPageShell
      description="Detalle operativo del pago, relacion con turno y eventos recibidos desde Mercado Pago."
      eyebrow="Pagos"
      onRefresh={load}
      title="Detalle de pago"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}
      {!payment ? (
        <SectionCard className="p-8 text-center text-clinic-muted">Cargando pago...</SectionCard>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <SectionCard className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
                <CreditCard size={20} />
              </span>
              <div>
                <h2 className="font-semibold text-clinic-ink">{formatMoney(payment.amount)}</h2>
                <p className="mt-1 text-sm text-clinic-muted">{payment.patients ? `${payment.patients.first_name} ${payment.patients.last_name}` : "Sin paciente"}</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              <Info label="Estado del pago" value={paymentStatusLabel(getEffectivePaymentStatus(payment))} />
              <Info label="Turno asociado" value={payment.appointment_id ?? "Sin turno asociado"} />
              <Info label="Fecha y hora del turno" value={payment.appointments?.starts_at ? formatDate(payment.appointments.starts_at, payment.clinics?.timezone ?? undefined) : "Sin fecha/hora"} />
              <Info label="Fecha/hora del pago" value={payment.paid_at ? formatDate(payment.paid_at, payment.clinics?.timezone ?? undefined) : "Sin acreditacion"} />
              <Info label="Creado" value={formatDate(payment.created_at, payment.clinics?.timezone ?? undefined)} />
              <Info label="Vencimiento" value={payment.expires_at ? formatDate(payment.expires_at, payment.clinics?.timezone ?? undefined) : "Sin vencimiento"} />
              <Info label="Estado del turno" value={payment.appointments?.status ?? "Sin turno"} />
              <Info label="Estado pago turno" value={payment.appointments?.payment_status ?? "Sin estado"} />
              <Info label="Tipo de pago" value={getPaymentKind(payment).label} />
              <Info label="Monto pagado" value={formatMoney(payment.amount)} />
              <Info label="Saldo pendiente" value={formatRemaining(getPaymentKind(payment).remainingAmount)} />
              <Info label="Proveedor" value={payment.provider ?? "manual"} />
              <Info label="Provider payment id" value={payment.provider_payment_id ?? "Pendiente"} />
              <Info label="Preference id" value={payment.provider_preference_id ?? "Pendiente"} />
              <Info label="External reference" value={payment.external_reference ?? "Sin referencia"} />
              <Info label="Metodo" value={payment.payment_method ?? "Pendiente"} />
            </dl>
            <div className="mt-5">
              <Button icon={<RefreshCw size={16} />} onClick={syncCurrentPayment} disabled={syncing}>
                {syncing ? "Actualizando..." : "Actualizar estado"}
              </Button>
            </div>
            {(!payment.appointment_id || !payment.appointments?.starts_at) && (
              <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Advertencia: este pago no tiene un turno asociado con fecha y hora. Revisar la reserva original antes de contactar al paciente.
              </p>
            )}
            {payment.checkout_url && (
              <a className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-clinic-line px-4 py-2 text-sm font-semibold" href={payment.checkout_url}>
                <ExternalLink size={16} /> Abrir checkout
              </a>
            )}
            <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Pago registrado. La emision fiscal se gestiona desde Facturacion.
            </p>
          </SectionCard>

          <SectionCard className="overflow-hidden">
            <div className="border-b border-clinic-line px-5 py-4"><h2 className="font-semibold">Eventos</h2></div>
            <div className="divide-y divide-clinic-line">
              {events.length === 0 ? (
                <p className="px-5 py-8 text-sm text-clinic-muted">Sin eventos registrados.</p>
              ) : events.map((event) => (
                <article key={event.id} className="px-5 py-4">
                  <p className="font-semibold text-clinic-ink">{event.event_type}</p>
                  <p className="mt-1 text-sm text-clinic-muted">{formatDate(event.created_at, payment.clinics?.timezone ?? undefined)} · {event.provider_event_id ?? "Sin id proveedor"}</p>
                </article>
              ))}
            </div>
          </SectionCard>
        </section>
      )}
    </AdminPageShell>
  );
}

export function PaymentSettingsPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [form, setForm] = useState({
    active: false,
    mode: "sandbox",
    public_key: "",
    checkout_public_name: "",
    collect_deposit_online: false,
    deposit_type: "fixed",
    deposit_amount: "",
    deposit_percentage: "",
    payment_link_expiration_minutes: "",
    support_email: ""
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [envHealth, setEnvHealth] = useState<EnvHealth | null>(null);

  async function load() {
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) return;
      const loadedSettings = await getPaymentSettings(loadedClinic.id);
      setSettings(loadedSettings);
      const healthResponse = await fetch("/api/health/env");
      if (healthResponse.ok) {
        setEnvHealth(await healthResponse.json());
      }
      if (loadedSettings) {
        setForm({
          active: loadedSettings.active,
          mode: loadedSettings.mode,
          public_key: loadedSettings.public_key ?? "",
          checkout_public_name: loadedSettings.checkout_public_name ?? "",
          collect_deposit_online: loadedSettings.collect_deposit_online,
          deposit_type: loadedSettings.deposit_type,
          deposit_amount: loadedSettings.deposit_amount ? String(loadedSettings.deposit_amount) : "",
          deposit_percentage: loadedSettings.deposit_percentage ? String(loadedSettings.deposit_percentage) : "",
          payment_link_expiration_minutes: loadedSettings.payment_link_expiration_minutes ? String(loadedSettings.payment_link_expiration_minutes) : "",
          support_email: loadedSettings.support_email ?? ""
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar configuracion de pagos.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    try {
      const updated = await updatePaymentSettings(settings.id, {
        active: form.active,
        mode: form.mode,
        public_key: form.public_key || null,
        checkout_public_name: form.checkout_public_name || clinic?.name || null,
        collect_deposit_online: form.collect_deposit_online,
        deposit_type: form.deposit_type,
        deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : null,
        deposit_percentage: form.deposit_percentage ? Number(form.deposit_percentage) : null,
        payment_link_expiration_minutes: form.payment_link_expiration_minutes ? Number(form.payment_link_expiration_minutes) : null,
        support_email: form.support_email || null
      });
      setSettings(updated);
      setNotice("Configuracion de pagos actualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar pagos.");
    }
  }

  return (
    <AdminPageShell
      description="Configura Mercado Pago Checkout Pro sin exponer access tokens en frontend."
      eyebrow="Pagos"
      onRefresh={load}
      title="Configuracion Mercado Pago"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}
      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <SectionCard className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
              <Settings size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-clinic-ink">Mercado Pago</h2>
              <p className="mt-1 text-sm text-clinic-muted">El access token se carga en Vercel. No se muestra ni se guarda plano desde la UI.</p>
            </div>
          </div>
          <form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2"><input checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} type="checkbox" /><span className="text-sm font-medium">Integracion activa</span></label>
            <Select label="Modo" value={form.mode} onChange={(value) => setForm({ ...form, mode: value })} options={[{ value: "sandbox", label: "Test / sandbox" }, { value: "production", label: "Produccion" }]} />
            <Input label="Public key" value={form.public_key} onChange={(value) => setForm({ ...form, public_key: value })} />
            <Input label="Nombre publico en checkout" value={form.checkout_public_name} onChange={(value) => setForm({ ...form, checkout_public_name: value })} />
            <label className="flex items-center gap-2"><input checked={form.collect_deposit_online} onChange={(event) => setForm({ ...form, collect_deposit_online: event.target.checked })} type="checkbox" /><span className="text-sm font-medium">Cobrar sena en reservas online</span></label>
            <Select label="Tipo de sena" value={form.deposit_type} onChange={(value) => setForm({ ...form, deposit_type: value })} options={[{ value: "fixed", label: "Monto fijo" }, { value: "percentage", label: "Porcentaje" }]} />
            <Input label="Monto fijo de sena" value={form.deposit_amount} onChange={(value) => setForm({ ...form, deposit_amount: value })} type="number" />
            <Input label="Porcentaje de sena" value={form.deposit_percentage} onChange={(value) => setForm({ ...form, deposit_percentage: value })} type="number" />
            <Input label="Vencimiento link en minutos" value={form.payment_link_expiration_minutes} onChange={(value) => setForm({ ...form, payment_link_expiration_minutes: value })} type="number" />
            <Input label="Email de soporte" value={form.support_email} onChange={(value) => setForm({ ...form, support_email: value })} />
            <div className="md:col-span-2"><Button type="submit" variant="primary">Guardar configuracion</Button></div>
          </form>
        </SectionCard>

        <SectionCard className="p-5">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700"><WalletCards size={20} /></div>
          <h2 className="mt-4 font-semibold text-clinic-ink">Estado de conexion</h2>
          <p className="mt-2 text-sm text-clinic-muted">
            Estado UI: {settings?.active ? "conectado" : "no conectado"}. La conexion real depende de las variables backend.
          </p>
          <div className="mt-4 grid gap-2">
            <EnvRow label="Mercado Pago access token" ready={envHealth?.mercadoPagoAccessToken} />
            <EnvRow label="Mercado Pago public key" ready={envHealth?.mercadoPagoPublicKey} />
            <EnvRow label="Mercado Pago webhook secret" ready={envHealth?.mercadoPagoWebhookSecret} />
            <EnvRow label={`Modo ${form.mode === "production" ? "produccion" : "sandbox"}`} ready={envHealth?.mercadoPagoEnv} />
            <EnvRow label="APP_PUBLIC_URL" ready={envHealth?.appPublicUrl} />
            <EnvRow label="Supabase server URL" ready={envHealth?.supabaseUrl} />
            <EnvRow label="Supabase service role key" ready={envHealth?.supabaseServiceRoleKey} />
          </div>
          <div className="mt-4 rounded-lg bg-clinic-surface p-3 text-sm">
            <p className="font-semibold text-clinic-ink">Webhook URL</p>
            <p className="mt-1 break-all text-clinic-muted">{getPublicAppUrl()}/api/payments/mercadopago/webhook</p>
          </div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Variables requeridas en Vercel: MERCADO_PAGO_ACCESS_TOKEN, MERCADO_PAGO_PUBLIC_KEY, MERCADO_PAGO_WEBHOOK_SECRET, MERCADO_PAGO_ENV, APP_PUBLIC_URL, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
          </div>
        </SectionCard>
      </section>
    </AdminPageShell>
  );
}

function EnvRow({ label, ready }: { label: string; ready?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-clinic-line px-3 py-2 text-sm">
      <span className="font-medium text-clinic-ink">{label}</span>
      <span className={`rounded-lg px-2 py-1 text-xs font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
        {ready ? "Configurado" : "Falta variable"}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm"><p className="text-sm text-clinic-muted">{label}</p><p className="mt-1 text-xl font-semibold text-clinic-ink">{value}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "approved" ? "bg-emerald-50 text-emerald-700" : ["pending", "in_process"].includes(status) ? "bg-amber-50 text-amber-700" : status === "expired" ? "bg-slate-100 text-slate-700" : "bg-red-50 text-red-700";
  return <span className={`rounded-lg px-3 py-2 text-center text-xs font-semibold ${tone}`}>{paymentStatusLabel(status)}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-clinic-line px-3 py-2"><dt className="text-clinic-muted">{label}</dt><dd className="mt-1 font-medium text-clinic-ink">{value}</dd></div>;
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label><span className="text-sm font-medium text-clinic-ink">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100" /></label>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label><span className="text-sm font-medium text-clinic-ink">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function Message({ tone, children }: { tone: "success" | "error"; children: string }) {
  const className = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    in_process: "En proceso",
    approved: "Aprobado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    charged_back: "Contracargo",
    expired: "Vencido"
  };
  return labels[status] ?? status;
}

function getEffectivePaymentStatus(payment: PaymentWithRelations) {
  if (["pending", "in_process"].includes(payment.status) && payment.expires_at && new Date(payment.expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  return payment.status;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value || 0));
}

function formatRemaining(value: number) {
  return Number(value ?? 0) <= 0 ? "Sin saldo pendiente" : formatMoney(value);
}

function getPaymentKind(payment: PaymentWithRelations) {
  const amount = Number(payment.amount ?? 0);
  const price = Number(payment.services?.price ?? 0);
  const remainingAmount = Math.max(price - amount, 0);
  if (price > 0 && amount >= price) return { label: "Pago total", remainingAmount };
  if (payment.services?.payment_required && !payment.services?.deposit_required) return { label: "Pago total", remainingAmount };
  const notesLookLikeDeposit = String(payment.notes ?? "").toLowerCase().includes("sena") || String(payment.notes ?? "").toLowerCase().includes("seña");
  if (payment.services?.deposit_required || notesLookLikeDeposit) return { label: "Seña", remainingAmount };
  return { label: "Pago total", remainingAmount };
}

async function syncPaymentStatus(paymentId: string) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch(`/api/payments/mercadopago/${paymentId}/sync`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error === "UNAUTHORIZED" ? "Necesitas iniciar sesion nuevamente." : payload.error ?? "No pudimos actualizar el estado.");
  }
  return payload;
}

function formatDate(value: string, timezone = "America/Argentina/Mendoza") {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}

function getPublicAppUrl() {
  if (typeof window !== "undefined" && window.location.origin) return window.location.origin;
  return appUrl;
}
