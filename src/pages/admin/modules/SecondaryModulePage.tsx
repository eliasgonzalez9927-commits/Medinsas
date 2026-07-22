import { useEffect, useMemo, useState } from "react";
import { FinancingSimulator } from "../../../components/fintech/FinancingSimulator";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { GrowthDashboard } from "../../../components/growth/GrowthDashboard";
import { DateRangeValue, isDateInRange, resolveDateRange } from "../../../lib/date-range";
import { getAppointments, getDefaultClinic, getPatients, getPayments, getProfessionals } from "../../../lib/clinic-data";
import { SectionCard } from "../../../components/admin/SectionCard";
import { AdminPageShell } from "./AdminPageShell";

export function FinancingPage() {
  return (
    <AdminPageShell
      description="Planes de pago, anticipo estimado y preparacion para scoring crediticio."
      eyebrow="Modulo financiero"
      title="Financiacion"
    >
      <FinancingSimulator />
    </AdminPageShell>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("this_month"));
  const [data, setData] = useState({ appointments: [] as any[], patients: [] as any[], payments: [] as any[], professionals: [] as any[] });

  useEffect(() => {
    async function load() {
      const clinic = await getDefaultClinic();
      if (!clinic) return;
      const [appointments, patients, payments, professionals] = await Promise.all([
        getAppointments(clinic.id, { dateFrom: range.dateFrom, dateTo: range.dateTo, timezone: clinic.timezone ?? undefined }),
        getPatients(clinic.id),
        getPayments(clinic.id, { dateFrom: range.dateFrom, dateTo: range.dateTo, timezone: clinic.timezone ?? undefined }),
        getProfessionals(clinic.id)
      ]);
      setData({ appointments, patients, payments, professionals: professionals.data });
    }
    load().catch(() => undefined);
  }, [range.dateFrom, range.dateTo]);

  const metrics = useMemo(() => {
    const approved = data.payments.filter((payment) => payment.status === "approved");
    const serviceCounts = new Map<string, number>();
    data.appointments.forEach((appointment) => serviceCounts.set(appointment.service?.name ?? appointment.reason, (serviceCounts.get(appointment.service?.name ?? appointment.reason) ?? 0) + 1));

    const noShows = data.appointments.filter((appointment) => appointment.status === "no_show").length;
    const finished = data.appointments.filter((appointment) => ["completed", "attended", "no_show"].includes(appointment.status)).length;
    const confirmed = data.appointments.filter((appointment) => appointment.status === "confirmed").length;

    const revenueByService = new Map<string, number>();
    approved.forEach((payment) => {
      const name = payment.services?.name ?? payment.appointments?.reason ?? "Otros";
      revenueByService.set(name, (revenueByService.get(name) ?? 0) + Number(payment.amount ?? 0));
    });

    return {
      appointments: data.appointments.length,
      newPatients: data.patients.filter((patient) => isDateInRange(patient.created_at, range)).length,
      collected: approved.reduce((total, payment) => total + Number(payment.amount ?? 0), 0),
      cancellations: data.appointments.filter((appointment) => appointment.status === "cancelled").length,
      reschedules: data.appointments.filter((appointment) => appointment.status === "rescheduled").length,
      overbookings: data.appointments.filter((appointment) => appointment.is_overbooking).length,
      occupancy: data.professionals.filter((professional) => professional.active).length ? Math.round((data.appointments.length / data.professionals.filter((professional) => professional.active).length) * 100) : 0,
      topServices: [...serviceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
      noShowRate: finished > 0 ? (noShows / finished) * 100 : null,
      confirmationRate: data.appointments.length > 0 ? (confirmed / data.appointments.length) * 100 : null,
      avgTicket: approved.length > 0 ? approved.reduce((total, payment) => total + Number(payment.amount ?? 0), 0) / approved.length : null,
      topRevenueServices: [...revenueByService.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, revenue]) => ({ name, revenue }))
    };
  }, [data, range]);

  return (
    <AdminPageShell
      description="Ausentismo, ocupacion, pacientes nuevos, fuentes de turnos y servicios mas solicitados."
      eyebrow="Gestion"
      title="Reportes"
    >
      <DateRangeFilter defaultPreset="this_month" onChange={setRange} />
      <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <ReportMetric label="Turnos" value={String(metrics.appointments)} />
        <ReportMetric label="Pacientes nuevos" value={String(metrics.newPatients)} />
        <ReportMetric label="Cobrado" value={new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(metrics.collected)} />
        <ReportMetric label="Cancelaciones" value={String(metrics.cancellations)} />
        <ReportMetric label="Reprogramaciones" value={String(metrics.reschedules)} />
        <ReportMetric label="Sobreturnos" value={String(metrics.overbookings)} />
        <ReportMetric label="Ocupación estimada" value={`${metrics.occupancy}%`} />
      </section>
      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Servicios más solicitados</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">{metrics.topServices.length ? metrics.topServices.map(([name, count]) => <div key={name} className="rounded-lg border border-clinic-line p-3"><p className="font-medium text-clinic-ink">{name}</p><p className="mt-1 text-sm text-clinic-muted">{count} turnos en el período</p></div>) : <p className="text-sm text-clinic-muted">Sin datos para el período seleccionado.</p>}</div>
      </SectionCard>
      <GrowthDashboard
        periodLabel={range.label}
        metrics={{
          noShowRate: metrics.noShowRate,
          confirmationRate: metrics.confirmationRate,
          avgTicket: metrics.avgTicket,
          topRevenueServices: metrics.topRevenueServices
        }}
      />
    </AdminPageShell>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm"><p className="text-sm text-clinic-muted">{label}</p><p className="mt-2 text-xl font-semibold text-clinic-ink">{value}</p></div>;
}
