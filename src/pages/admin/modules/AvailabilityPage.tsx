import { CalendarClock, Plus } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { availabilityRules } from "../../../data/clinicMockData";
import { AdminPageShell } from "./AdminPageShell";

export function AvailabilityPage() {
  return (
    <AdminPageShell
      actionLabel="Crear regla"
      description="Define dias de atencion, horarios, duracion de turnos, descansos y bloqueos."
      eyebrow="Configuracion operativa"
      title="Disponibilidad"
    >
      <SectionCard className="overflow-hidden">
        <div className="border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Reglas de atencion</h2>
        </div>
        <div className="divide-y divide-clinic-line">
          {availabilityRules.map((rule) => (
            <article key={rule.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_140px_180px_180px_120px] lg:items-center">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  <CalendarClock size={18} />
                </div>
                <div>
                  <p className="font-semibold text-clinic-ink">{rule.professionalName}</p>
                  <p className="text-sm text-clinic-muted">{rule.location}</p>
                </div>
              </div>
              <p className="font-medium text-clinic-ink">{rule.day}</p>
              <p className="text-sm text-clinic-muted">
                {rule.startTime} a {rule.endTime}
              </p>
              <p className="text-sm text-clinic-muted">
                Turnos de {rule.slotDurationMinutes} min
              </p>
              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Activa
              </span>
              {rule.block && (
                <p className="lg:col-start-2 lg:col-span-4 text-sm text-amber-700">
                  Bloqueo configurado: {rule.block}
                </p>
              )}
            </article>
          ))}
        </div>
      </SectionCard>
      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Excepciones y feriados</h2>
        <p className="mt-1 text-sm text-clinic-muted">
          Proximo paso: conectar bloqueos por fecha, feriados y cupos por franja.
        </p>
        <Button className="mt-4" icon={<Plus size={16} />} variant="primary">
          Agregar bloqueo
        </Button>
      </SectionCard>
    </AdminPageShell>
  );
}
