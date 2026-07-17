import { useEffect, useState } from "react";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { SectionCard } from "../../../components/admin/SectionCard";
import { useAuth } from "../../../contexts/AuthContext";
import { getDefaultClinic, getProfessionalIncome, getProfessionals, ProfessionalIncomeRow } from "../../../lib/clinic-data";
import { DateRangeValue, resolveDateRange } from "../../../lib/date-range";
import { Clinic } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

export function ProfessionalIncomePage() {
  const { clinicMembership } = useAuth();
  const myProfessionalId = clinicMembership?.professional_id ?? null;

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [sharePercentage, setSharePercentage] = useState<number | null>(null);
  const [income, setIncome] = useState<{ totalCobrado: number; totalPendiente: number; rows: ProfessionalIncomeRow[] }>({
    totalCobrado: 0,
    totalPendiente: 0,
    rows: []
  });
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("this_month"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    if (!myProfessionalId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) return;
      const [professionalResult, incomeResult] = await Promise.all([
        getProfessionals(loadedClinic.id),
        getProfessionalIncome(loadedClinic.id, myProfessionalId, {
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          timezone: loadedClinic.timezone ?? undefined
        })
      ]);
      const mine = professionalResult.data.find((item) => item.id === myProfessionalId);
      setSharePercentage(mine?.professional_share_percentage ?? null);
      setIncome(incomeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar tus ingresos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [myProfessionalId, range.dateFrom, range.dateTo]);

  if (!myProfessionalId) {
    return (
      <AdminPageShell description="" eyebrow="Ingresos" title="Mis ingresos">
        <Message>
          Tu usuario no está vinculado a un profesional en esta clínica. Contactá al administrador para que te
          asocie a tu perfil profesional.
        </Message>
      </AdminPageShell>
    );
  }

  const liquidacion = sharePercentage != null ? income.totalCobrado * (sharePercentage / 100) : null;

  return (
    <AdminPageShell
      description="Lo que generaste con tus propios turnos y tu liquidación según tu porcentaje acordado con la clínica."
      eyebrow="Ingresos"
      onRefresh={load}
      title="Mis ingresos"
    >
      {error && <Message tone="error">{error}</Message>}

      <DateRangeFilter timezone={clinic?.timezone ?? "America/Argentina/Mendoza"} defaultPreset="this_month" onChange={setRange} />

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Cobrado" value={formatMoney(income.totalCobrado)} />
        <MetricCard
          label="Tu liquidación"
          value={liquidacion != null ? formatMoney(liquidacion) : "—"}
          sub={sharePercentage != null ? `${sharePercentage}% acordado con la clínica` : "Tu % todavía no está configurado — hablalo con administración."}
          accent="teal"
        />
        <MetricCard label="Pendiente de cobro" value={formatMoney(income.totalPendiente)} />
      </section>

      <SectionCard className="overflow-visible">
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Detalle por atención</h2>
          <p className="mt-1 text-sm text-clinic-muted">{range.label}</p>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">Cargando...</div>
        ) : income.rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">No hay movimientos en este período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-clinic-line text-left text-clinic-muted">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Paciente</th>
                  <th className="px-5 py-3 font-medium">Servicio</th>
                  <th className="px-5 py-3 text-right font-medium">Monto</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-clinic-line">
                {income.rows.map((row) => (
                  <tr key={row.paymentId} className="hover:bg-clinic-surface/60">
                    <td className="px-5 py-3 text-clinic-ink">{formatDate(row.createdAt)}</td>
                    <td className="px-5 py-3 text-clinic-ink">{row.patientName}</td>
                    <td className="px-5 py-3 text-clinic-muted">{row.serviceName}</td>
                    <td className="px-5 py-3 text-right font-semibold text-clinic-ink">{formatMoney(row.amount)}</td>
                    <td className="px-5 py-3 text-right">
                      <PaymentStatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "teal" }) {
  return (
    <div className="rounded-xl border border-clinic-line bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-clinic-muted">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${accent === "teal" ? "text-clinic-brand" : "text-clinic-ink"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-clinic-muted">{sub}</p>}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    approved: "Cobrado",
    pending: "Pendiente",
    in_process: "En proceso",
    rejected: "Rechazado",
    refunded: "Reembolsado"
  };
  const tone =
    status === "approved"
      ? "bg-emerald-50 text-emerald-700"
      : ["pending", "in_process"].includes(status)
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
  return <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tone}`}>{labels[status] ?? status}</span>;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short" }).format(new Date(value));
}

function Message({ tone = "error", children }: { tone?: "error"; children: string }) {
  const className = tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}
