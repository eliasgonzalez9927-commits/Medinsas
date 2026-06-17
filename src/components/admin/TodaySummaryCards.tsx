import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock3, Percent, UserX } from "lucide-react";
import { MetricCard } from "./MetricCard";

export type TodaySummary = {
  total: number;
  pending: number;
  confirmed: number;
  urgent: number;
  cancellations: number;
  occupancy: number;
};

export function TodaySummaryCards({ summary }: { summary: TodaySummary }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <MetricCard
        title="Turnos hoy"
        value={summary.total}
        helper="Actividad programada"
        badge="Hoy"
        icon={<Clock3 size={20} />}
        tone="info"
      />
      <MetricCard
        title="Pendientes"
        value={summary.pending}
        helper="Requieren confirmacion"
        icon={<AlertTriangle size={20} />}
        tone="warning"
      />
      <MetricCard
        title="Confirmados"
        value={summary.confirmed}
        helper="Pacientes listos"
        icon={<CheckCircle2 size={20} />}
        tone="success"
      />
      <MetricCard
        title="Urgencias"
        value={summary.urgent}
        helper="Prioridad clinica"
        icon={<CalendarCheck2 size={20} />}
        tone="danger"
      />
      <MetricCard
        title="Ausentismo"
        value={summary.cancellations}
        helper="Cancelados o ausentes"
        icon={<UserX size={20} />}
        tone="danger"
      />
      <MetricCard
        title="Ocupacion"
        value={`${summary.occupancy}%`}
        helper="Capacidad estimada"
        icon={<Percent size={20} />}
        tone="default"
      />
    </section>
  );
}
