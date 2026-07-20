import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown, CreditCard, ExternalLink, RefreshCw, Settings, WalletCards } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { Button } from "../../../components/ui/Button";
import {
  getDefaultClinic,
  getPaymentById,
  getPaymentEvents,
  getPayments,
  getPaymentSettings,
  getProfessionals,
  updatePaymentSettings
} from "../../../lib/clinic-data";
import { getPublicAppUrl } from "../../../lib/public-url";
import { DateRangeValue, resolveDateRange } from "../../../lib/date-range";
import { supabase } from "../../../lib/supabase";
import { Clinic, PaymentEvent, PaymentSettings, PaymentWithRelations } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";
import { SettingsTabsNav } from "./SettingsPage";

type EnvHealth = {
  mercadoPagoAccessToken: boolean;
  mercadoPagoPublicKey: boolean;
  mercadoPagoWebhookSecret: boolean;
  mercadoPagoEnv: boolean;
  appPublicUrl: boolean;
  supabaseUrl: boolean;
  supabaseServiceRoleKey: boolean;
};

type RendicionRow = {
  profId: string | null;
  name: string;
  count: number;
  cobrado: number;
  pendiente: number;
  senias: number;
  profShare: number | null;
};

export function PaymentsPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [payments, setPayments] = useState<PaymentWithRelations[]>([]);
  const [profMap, setProfMap] = useState<Record<string, string>>({});
  const [profShareMap, setProfShareMap] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingId, setSyncingId] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("this_month"));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) return;
      const [loadedPayments, profsResult] = await Promise.all([
        getPayments(loadedClinic.id, { dateFrom: range.dateFrom, dateTo: range.dateTo, timezone: loadedClinic.timezone ?? undefined }),
        getProfessionals(loadedClinic.id)
      ]);
      setPayments(Array.isArray(loadedPayments) ? loadedPayments : []);
      const map: Record<string, string> = {};
      const shareMap: Record<string, number | null> = {};
      for (const p of profsResult.data) {
        map[p.id] = `${p.name} ${p.last_name}`.trim();
        shareMap[p.id] = p.professional_share_percentage ?? null;
      }
      setProfMap(map);
      setProfShareMap(shareMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los ingresos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [range.dateFrom, range.dateTo]);

  const safe = useMemo(() => Array.isArray(payments) ? payments : [], [payments]);

  const summary = useMemo(() => {
    const approved = safe.filter(p => getEffectivePaymentStatus(p) === "approved");
    const pending = safe.filter(p => ["pending", "in_process"].includes(getEffectivePaymentStatus(p)));
    const expired = safe.filter(p => getEffectivePaymentStatus(p) === "expired");
    const senias = approved.filter(p => getPaymentKind(p).type === "deposit");
    const manual = approved.filter(p => !isMercadoPago(p));
    const mp = approved.filter(p => isMercadoPago(p));
    return {
      total: safe.length,
      cobrado: approved.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      porCobrar: pending.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      vencido: expired.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      senias: senias.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      seniaCount: senias.length,
      manual: manual.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      manualCount: manual.length,
      mp: mp.reduce((s, p) => s + Number(p.amount ?? 0), 0),
      mpCount: mp.length,
    };
  }, [safe]);

  const rendicion = useMemo<RendicionRow[]>(() => {
    const byProf = new Map<string, RendicionRow>();
    for (const p of safe) {
      const profId = getProfId(p);
      const key = profId ?? "__none__";
      if (!byProf.has(key)) {
        const name = (profId && profMap[profId]) ? profMap[profId] : "Sin profesional";
        const profShare = profId ? (profShareMap[profId] ?? null) : null;
        byProf.set(key, { profId, name, count: 0, cobrado: 0, pendiente: 0, senias: 0, profShare });
      }
      const row = byProf.get(key)!;
      const status = getEffectivePaymentStatus(p);
      const amount = Number(p.amount ?? 0);
      row.count++;
      if (status === "approved") {
        row.cobrado += amount;
        if (getPaymentKind(p).type === "deposit") row.senias += amount;
      } else if (["pending", "in_process"].includes(status)) {
        row.pendiente += amount;
      }
    }
    return Array.from(byProf.values()).sort((a, b) => b.cobrado - a.cobrado);
  }, [safe, profMap, profShareMap]);

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
      description="Resumen de ingresos, rendición por profesional y trazabilidad de movimientos."
      eyebrow="Finanzas"
      onRefresh={load}
      title="Ingresos"
    >
      {error && <Message tone="error">{error}</Message>}
      <DateRangeFilter timezone={clinic?.timezone ?? "America/Argentina/Mendoza"} defaultPreset="this_month" onChange={setRange} />

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Cobrado" value={formatMoney(summary.cobrado)} accent="teal" size="lg" />
        <MetricCard label="Por cobrar" value={formatMoney(summary.porCobrar)} accent="amber" size="lg" />
        <MetricCard label="Vencido" value={formatMoney(summary.vencido)} accent="slate" size="lg" />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Señas cobradas" value={formatMoney(summary.senias)} sub={`${summary.seniaCount} seña${summary.seniaCount !== 1 ? "s" : ""}`} size="sm" />
        <MetricCard label="Manual" value={formatMoney(summary.manual)} sub={`${summary.manualCount} pago${summary.manualCount !== 1 ? "s" : ""}`} size="sm" />
        <MetricCard label="Mercado Pago" value={formatMoney(summary.mp)} sub={`${summary.mpCount} pago${summary.mpCount !== 1 ? "s" : ""}`} size="sm" />
        <MetricCard label="Movimientos" value={String(summary.total)} sub="en el periodo" size="sm" />
      </section>

      {rendicion.length > 0 && (
        <SectionCard className="overflow-hidden">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold text-clinic-ink">Rendición por profesional</h2>
            <p className="mt-1 text-sm text-clinic-muted">{range.label}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-line text-left text-clinic-muted">
                  <th className="px-5 py-3 font-medium">Profesional</th>
                  <th className="px-5 py-3 text-right font-medium">Movimientos</th>
                  <th className="px-5 py-3 text-right font-medium">Cobrado</th>
                  <th className="px-5 py-3 text-right font-medium">Para profesional</th>
                  <th className="px-5 py-3 text-right font-medium">Para clínica</th>
                  <th className="px-5 py-3 text-right font-medium">Señas</th>
                  <th className="px-5 py-3 text-right font-medium">Por cobrar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-line">
                {rendicion.map(row => {
                  const paraProf = row.profShare != null ? row.cobrado * (row.profShare / 100) : null;
                  const paraClinica = paraProf != null ? row.cobrado - paraProf : null;
                  const shareLabel = row.profShare != null ? `${row.profShare}%` : null;
                  const clinicLabel = row.profShare != null ? `${100 - row.profShare}%` : null;
                  return (
                    <tr key={row.profId ?? "__none__"} className="hover:bg-clinic-surface/60">
                      <td className="px-5 py-3 font-medium text-clinic-ink">{row.name}</td>
                      <td className="px-5 py-3 text-right text-clinic-muted">{row.count}</td>
                      <td className="px-5 py-3 text-right font-semibold text-clinic-ink">{formatMoney(row.cobrado)}</td>
                      <td className="px-5 py-3 text-right text-clinic-muted">
                        {paraProf != null
                          ? <><span className="font-semibold text-clinic-ink">{formatMoney(paraProf)}</span><span className="ml-1 text-xs text-clinic-muted">({shareLabel})</span></>
                          : (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-xs italic text-amber-600">Sin % configurado</span>
                              {row.profId && (
                                <Link to={`/admin/profesionales/${row.profId}#rendicion`} className="text-xs font-semibold text-clinic-brand hover:underline">
                                  Configurar %
                                </Link>
                              )}
                            </span>
                          )
                        }
                      </td>
                      <td className="px-5 py-3 text-right text-clinic-muted">
                        {paraClinica != null
                          ? <><span className="font-semibold text-clinic-ink">{formatMoney(paraClinica)}</span><span className="ml-1 text-xs text-clinic-muted">({clinicLabel})</span></>
                          : <span className="text-xs italic text-clinic-muted">—</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-right text-clinic-muted">{formatMoney(row.senias)}</td>
                      <td className="px-5 py-3 text-right text-clinic-muted">{formatMoney(row.pendiente)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
          <div>
            <h2 className="font-semibold text-clinic-ink">Movimientos</h2>
            <p className="mt-1 text-sm text-clinic-muted">{range.label}</p>
          </div>
          <Link to="/admin/pagos/configuracion" className="text-sm font-semibold text-clinic-brand">Configurar MP</Link>
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-clinic-muted">Cargando ingresos...</p>
        ) : safe.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-clinic-muted">No hay movimientos en el periodo seleccionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-line text-left text-clinic-muted">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Paciente</th>
                  <th className="px-4 py-3 font-medium">Profesional</th>
                  <th className="px-4 py-3 font-medium">Servicio</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Fuente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Monto</th>
                  <th className="px-4 py-3 font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-line">
                {safe.map(payment => {
                  const profId = getProfId(payment);
                  const profName = (profId && profMap[profId]) ? profMap[profId] : "—";
                  return (
                    <tr key={payment.id} className="hover:bg-clinic-surface/60">
                      <td className="whitespace-nowrap px-4 py-3 text-clinic-muted">
                        {formatDate(payment.paid_at ?? payment.created_at, payment.clinics?.timezone ?? undefined)}
                      </td>
                      <td className="px-4 py-3 font-medium text-clinic-ink">
                        {payment.patients && payment.patient_id ? (
                          <Link to={`/admin/pacientes/${payment.patient_id}`} className="hover:text-clinic-brand hover:underline">
                            {payment.patients.first_name} {payment.patients.last_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-clinic-muted">{profName}</td>
                      <td className="px-4 py-3 text-clinic-muted">{payment.services?.name ?? payment.notes ?? "—"}</td>
                      <td className="px-4 py-3 text-clinic-muted">{getPaymentKind(payment).label}</td>
                      <td className="px-4 py-3 text-clinic-muted">{isMercadoPago(payment) ? "Mercado Pago" : "Manual"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={getEffectivePaymentStatus(payment)} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-clinic-ink">
                        {formatMoney(payment.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-clinic-line px-2 py-1 text-xs font-semibold text-clinic-ink hover:bg-clinic-surface disabled:opacity-60"
                            disabled={syncingId === payment.id}
                            onClick={() => syncPayment(payment.id)}
                            type="button"
                          >
                            <RefreshCw size={12} /> {syncingId === payment.id ? "..." : "Sync"}
                          </button>
                          <Link className="text-sm font-semibold text-clinic-brand" to={`/admin/pagos/${payment.id}`}>Ver</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
  const [showTech, setShowTech] = useState(false);

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
                <p className="mt-1 text-sm text-clinic-muted">
                  {payment.patients && payment.patient_id ? (
                    <Link to={`/admin/pacientes/${payment.patient_id}`} className="font-semibold text-clinic-brand hover:underline">
                      {payment.patients.first_name} {payment.patients.last_name}
                    </Link>
                  ) : (
                    "Sin paciente"
                  )}
                </p>
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
              <Info label="Método de pago" value={payment.payment_method ?? "Pendiente"} />
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
            <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Pago registrado. La emision fiscal se gestiona desde Facturacion.
            </p>
            <div className="mt-4 border-t border-clinic-line pt-4">
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-semibold text-clinic-muted hover:text-clinic-ink"
                onClick={() => setShowTech(v => !v)}
              >
                <ChevronDown size={12} className={`transition-transform ${showTech ? "rotate-180" : ""}`} />
                Datos técnicos (soporte)
              </button>
              {showTech && (
                <dl className="mt-3 grid gap-3 text-sm">
                  <Info label="Proveedor" value={payment.provider ?? "manual"} />
                  <Info label="Provider payment id" value={payment.provider_payment_id ?? "Sin ID"} />
                  <Info label="Preference id" value={payment.provider_preference_id ?? "Sin ID"} />
                  <Info label="External reference" value={payment.external_reference ?? "Sin referencia"} />
                  {payment.checkout_url && (
                    <a className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-clinic-line px-3 py-2 text-sm font-semibold" href={payment.checkout_url}>
                      <ExternalLink size={14} /> Abrir checkout
                    </a>
                  )}
                </dl>
              )}
            </div>
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
      <SettingsTabsNav activeTab="payments" />
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
            <label className="flex items-center gap-2"><input checked={form.collect_deposit_online} onChange={(event) => setForm({ ...form, collect_deposit_online: event.target.checked })} type="checkbox" /><span className="text-sm font-medium">Cobrar seña en reservas online</span></label>
            <Select label="Tipo de seña" value={form.deposit_type} onChange={(value) => setForm({ ...form, deposit_type: value })} options={[{ value: "fixed", label: "Monto fijo" }, { value: "percentage", label: "Porcentaje" }]} />
            <Input label="Monto fijo de seña" value={form.deposit_amount} onChange={(value) => setForm({ ...form, deposit_amount: value })} type="number" />
            <Input label="Porcentaje de seña" value={form.deposit_percentage} onChange={(value) => setForm({ ...form, deposit_percentage: value })} type="number" />
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

function MetricCard({ label, value, sub, accent, size = "lg" }: { label: string; value: string; sub?: string; accent?: "teal" | "amber" | "slate"; size?: "lg" | "sm" }) {
  const valueClass = accent === "teal" ? "text-clinic-brand" : accent === "amber" ? "text-amber-600" : accent === "slate" ? "text-slate-500" : "text-clinic-ink";
  return (
    <div className={`rounded-xl border border-clinic-line bg-white shadow-sm ${size === "lg" ? "p-5" : "p-4"}`}>
      <p className="text-sm font-medium text-clinic-muted">{label}</p>
      <p className={`mt-2 font-bold tracking-tight ${size === "lg" ? "text-2xl" : "text-xl"} ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-clinic-muted">{sub}</p>}
    </div>
  );
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
    pending: "Por cobrar",
    in_process: "Por cobrar",
    approved: "Cobrado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
    charged_back: "Contracargo",
    expired: "Vencido"
  };
  return labels[status] ?? status;
}

function getProfId(payment: PaymentWithRelations): string | null {
  return payment.professional_id ?? payment.appointments?.professional_id ?? null;
}

function isMercadoPago(payment: PaymentWithRelations): boolean {
  const p = (payment.provider ?? "").toLowerCase();
  return p.includes("mercado") || p === "mp";
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

function getPaymentKind(payment: PaymentWithRelations): { type: "deposit" | "full"; label: string; remainingAmount: number } {
  const amount = Number(payment.amount ?? 0);
  const price = Number(payment.services?.price ?? 0);
  const remainingAmount = Math.max(price - amount, 0);
  if (price > 0 && amount >= price) return { type: "full", label: "Pago total", remainingAmount };
  if (payment.services?.payment_required && !payment.services?.deposit_required) return { type: "full", label: "Pago total", remainingAmount };
  const notesLookLikeDeposit = String(payment.notes ?? "").toLowerCase().includes("sena") || String(payment.notes ?? "").toLowerCase().includes("seña");
  if (payment.services?.deposit_required || notesLookLikeDeposit) return { type: "deposit", label: "Seña", remainingAmount };
  return { type: "full", label: "Pago total", remainingAmount };
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
