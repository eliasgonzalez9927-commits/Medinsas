import { CalendarDays, Copy, Edit3, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { professionals } from "../../../data/clinicMockData";
import { AdminPageShell } from "./AdminPageShell";

export function ProfessionalsPage() {
  return (
    <AdminPageShell
      actionLabel="Crear profesional"
      description="Gestiona la cartilla medica, especialidades, servicios y agenda de cada profesional."
      eyebrow="Equipo clinico"
      title="Profesionales"
    >
      <section className="grid gap-4 lg:grid-cols-3">
        {professionals.map((professional) => (
          <SectionCard key={professional.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-clinic-ink">
                  Dr/a. {professional.name} {professional.lastName}
                </h2>
                <p className="mt-1 text-sm text-clinic-muted">{professional.specialties.join(", ")}</p>
              </div>
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  professional.active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {professional.active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              <Info label="Matricula" value={professional.licenseNumber} />
              <Info label="Sede" value={professional.location} />
              <Info label="Dias" value={professional.attentionDays.join(", ")} />
              <Info label="Duracion" value={`${professional.consultationMinutes} min`} />
              <Info label="Proximos turnos" value={String(professional.upcomingAppointments)} />
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to={`/admin/profesionales/${professional.id}`}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink transition hover:bg-clinic-surface"
              >
                <CalendarDays size={16} />
                Ver agenda
              </Link>
              <Button icon={<Edit3 size={16} />}>Editar</Button>
              <Button icon={<Copy size={16} />}>Copiar link</Button>
            </div>
          </SectionCard>
        ))}
      </section>
      <SectionCard className="p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-clinic-ink">Alta rapida de profesional</h2>
            <p className="mt-1 text-sm text-clinic-muted">
              Estructura preparada para conectar un formulario real a Supabase.
            </p>
          </div>
          <Button icon={<Plus size={16} />} variant="primary">
            Agregar medico
          </Button>
        </div>
      </SectionCard>
    </AdminPageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-clinic-muted">{label}</dt>
      <dd className="text-right font-medium text-clinic-ink">{value}</dd>
    </div>
  );
}
