import { BarChart3, CalendarX2, Repeat2, Trophy } from "lucide-react";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

export type GrowthDashboardMetrics = {
  noShowRate: number | null;
  confirmationRate: number | null;
  avgTicket: number | null;
  topRevenueServices: Array<{ name: string; revenue: number }>;
};

export function GrowthDashboard({
  periodLabel = "Mes actual",
  metrics
}: {
  periodLabel?: string;
  metrics: GrowthDashboardMetrics;
}) {
  const kpis = [
    {
      title: "Tasa de ausentismo",
      value: metrics.noShowRate === null ? "Sin datos" : `${metrics.noShowRate.toFixed(1)}%`,
      description: "No asistió sobre turnos ya finalizados",
      icon: CalendarX2
    },
    {
      title: "Tasa de confirmación",
      value: metrics.confirmationRate === null ? "Sin datos" : `${metrics.confirmationRate.toFixed(1)}%`,
      description: "Turnos confirmados sobre el total del período",
      icon: Repeat2
    },
    {
      title: "Ticket promedio",
      value: metrics.avgTicket === null ? "Sin datos" : currency.format(metrics.avgTicket),
      description: "Promedio de pagos acreditados del período",
      icon: Trophy
    }
  ];

  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-clinic-ink">Indicadores de gestion</h2>
          <p className="mt-1 text-sm text-clinic-muted">
            Señales clave para mejorar agenda, retención y rentabilidad.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg bg-clinic-surface px-3 py-2 text-sm font-medium text-clinic-muted">
          <BarChart3 size={18} />
          {periodLabel}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article key={kpi.title} className="rounded-lg border border-clinic-line bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-clinic-muted">{kpi.title}</span>
                <Icon size={19} className="text-clinic-brand" />
              </div>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-3xl font-semibold text-clinic-ink">{kpi.value}</p>
              </div>
              <p className="mt-2 text-sm text-clinic-muted">{kpi.description}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-clinic-line">
        <div className="border-b border-clinic-line px-4 py-3">
          <h3 className="font-semibold text-clinic-ink">Servicios con más facturación del período</h3>
        </div>
        <div className="divide-y divide-clinic-line">
          {metrics.topRevenueServices.length ? (
            metrics.topRevenueServices.map((service) => (
              <div key={service.name} className="flex items-center justify-between gap-3 px-4 py-4">
                <p className="font-medium text-clinic-ink">{service.name}</p>
                <p className="text-sm font-semibold text-clinic-ink">{currency.format(service.revenue)}</p>
              </div>
            ))
          ) : (
            <p className="px-4 py-4 text-sm text-clinic-muted">Sin pagos acreditados en el período seleccionado.</p>
          )}
        </div>
      </div>
    </section>
  );
}
