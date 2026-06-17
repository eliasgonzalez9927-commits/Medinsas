import { BadgeDollarSign, Clock3, Plus } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { services } from "../../../data/clinicMockData";
import { AdminPageShell } from "./AdminPageShell";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

export function ServicesPage() {
  return (
    <AdminPageShell
      actionLabel="Crear servicio"
      description="Configura tratamientos, duracion, precio, profesionales asignados y reglas comerciales."
      eyebrow="Catalogo clinico"
      title="Servicios y tratamientos"
    >
      <section className="grid gap-4 lg:grid-cols-3">
        {services.map((service) => (
          <SectionCard key={service.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-clinic-ink">{service.name}</h2>
                <p className="mt-1 text-sm text-clinic-muted">{service.specialty}</p>
              </div>
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Activo
              </span>
            </div>
            <div className="mt-5 grid gap-3 text-sm">
              <p className="flex items-center gap-2 text-clinic-muted">
                <Clock3 size={16} /> {service.durationMinutes} minutos
              </p>
              <p className="flex items-center gap-2 text-clinic-muted">
                <BadgeDollarSign size={16} /> {currency.format(service.price)}
              </p>
              <p className="text-clinic-muted">
                Profesionales: <span className="font-medium text-clinic-ink">{service.professionals.join(", ")}</span>
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {service.depositRequired && (
                <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Requiere sena
                </span>
              )}
              {service.financingEnabled && (
                <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  Permite financiacion
                </span>
              )}
            </div>
          </SectionCard>
        ))}
      </section>
      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Formulario preparado</h2>
        <p className="mt-1 text-sm text-clinic-muted">
          Proximo paso: persistir servicios en Supabase y vincularlos con profesionales y especialidades.
        </p>
        <Button className="mt-4" icon={<Plus size={16} />} variant="primary">
          Crear nuevo servicio
        </Button>
      </SectionCard>
    </AdminPageShell>
  );
}
