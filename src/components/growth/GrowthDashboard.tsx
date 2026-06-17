import { BarChart3, CalendarX2, Repeat2, Trophy } from "lucide-react";

const kpis = [
  {
    title: "Tasa de ausentismo",
    value: "8.4%",
    delta: "-2.1%",
    description: "Comparado con el mes anterior",
    icon: CalendarX2
  },
  {
    title: "Pacientes nuevos",
    value: "126",
    delta: "+18%",
    description: "Nuevos vs. recurrentes: 38% / 62%",
    icon: Repeat2
  },
  {
    title: "Ticket promedio",
    value: "$92K",
    delta: "+11%",
    description: "Promedio de tratamientos del mes",
    icon: Trophy
  }
];

const profitableTreatments = [
  { name: "Implantologia", revenue: 1840000, margin: 42 },
  { name: "Ortodoncia invisible", revenue: 1260000, margin: 38 },
  { name: "Dermatologia laser", revenue: 940000, margin: 34 }
];

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

export function GrowthDashboard() {
  return (
    <section className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-clinic-ink">Indicadores de gestion</h2>
          <p className="mt-1 text-sm text-clinic-muted">
            Senales clave para mejorar agenda, retencion y rentabilidad.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg bg-clinic-surface px-3 py-2 text-sm font-medium text-clinic-muted">
          <BarChart3 size={18} />
          Mes actual
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
                <span className="mb-1 rounded-lg bg-teal-50 px-2 py-1 text-xs font-semibold text-clinic-brand">
                  {kpi.delta}
                </span>
              </div>
              <p className="mt-2 text-sm text-clinic-muted">{kpi.description}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-5 rounded-lg border border-clinic-line">
        <div className="border-b border-clinic-line px-4 py-3">
          <h3 className="font-semibold text-clinic-ink">Tratamientos mas rentables del mes</h3>
        </div>
        <div className="divide-y divide-clinic-line">
          {profitableTreatments.map((treatment) => (
            <div
              key={treatment.name}
              className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_160px_140px] sm:items-center"
            >
              <div>
                <p className="font-medium text-clinic-ink">{treatment.name}</p>
                <div className="mt-2 h-2 rounded-full bg-clinic-surface">
                  <div
                    className="h-2 rounded-full bg-clinic-brand"
                    style={{ width: `${treatment.margin}%` }}
                  />
                </div>
              </div>
              <p className="text-sm font-semibold text-clinic-ink">
                {currency.format(treatment.revenue)}
              </p>
              <p className="text-sm text-clinic-muted">Margen {treatment.margin}%</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
