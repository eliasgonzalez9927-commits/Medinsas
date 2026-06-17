export function DashboardHeader() {
  const today = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

  const normalizedToday = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    <section className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div>
        <p className="text-sm font-semibold text-clinic-brand">{normalizedToday} · Clinica Central</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-clinic-ink">
          Resumen de hoy
        </h1>
        <p className="mt-2 max-w-2xl text-clinic-muted">
          Gestiona turnos, pacientes y actividad diaria de la clinica desde un solo lugar.
        </p>
      </div>
      <div className="rounded-lg border border-clinic-line bg-white px-4 py-3 text-sm text-clinic-muted shadow-sm">
        Proxima accion: revisar pendientes de confirmacion y urgencias.
      </div>
    </section>
  );
}
