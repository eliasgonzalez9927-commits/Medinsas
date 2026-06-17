import { useParams } from "react-router-dom";
import { CalendarDays, Copy, Stethoscope } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { availabilityRules, professionals } from "../../../data/clinicMockData";
import { AdminPageShell } from "./AdminPageShell";

export function ProfessionalProfilePage() {
  const { id } = useParams();
  const professional = professionals.find((item) => item.id === id) ?? professionals[0];
  const rules = availabilityRules.filter((rule) =>
    rule.professionalName.includes(professional.lastName)
  );
  const bookingLink = `https://clinic-saas-mvp.vercel.app/reservar/clinica-central/${professional.id}`;

  return (
    <AdminPageShell
      description="Datos, servicios, agenda, disponibilidad y link publico filtrado por profesional."
      eyebrow="Perfil profesional"
      title={`Dr/a. ${professional.name} ${professional.lastName}`}
    >
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <SectionCard className="p-5">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
            <Stethoscope size={24} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-clinic-ink">Datos basicos</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label="Email" value={professional.email} />
            <Info label="Telefono" value={professional.phone} />
            <Info label="Matricula" value={professional.licenseNumber} />
            <Info label="Sede" value={professional.location} />
            <Info label="Duracion promedio" value={`${professional.consultationMinutes} min`} />
          </dl>
          <p className="mt-5 text-sm leading-6 text-clinic-muted">{professional.bio}</p>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="text-lg font-semibold text-clinic-ink">Servicios y especialidades</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {professional.specialties.map((specialty) => (
              <span key={specialty} className="rounded-lg bg-teal-50 px-3 py-1 text-sm font-semibold text-clinic-brand">
                {specialty}
              </span>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {professional.services.map((service) => (
              <div key={service} className="rounded-lg border border-clinic-line bg-clinic-surface p-3 text-sm font-medium text-clinic-ink">
                {service}
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-lg border border-clinic-line bg-white p-4">
            <p className="text-sm text-clinic-muted">Link publico de reserva</p>
            <p className="mt-1 truncate text-sm font-semibold text-clinic-ink">{bookingLink}</p>
            <Button className="mt-3" icon={<Copy size={15} />}>
              Copiar link
            </Button>
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard className="p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-clinic-ink">
            <CalendarDays size={19} />
            Horarios de atencion
          </h2>
          <div className="mt-4 space-y-3">
            {rules.length === 0 ? (
              <p className="text-sm text-clinic-muted">No hay reglas cargadas para este profesional.</p>
            ) : (
              rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-clinic-line p-3 text-sm">
                  <p className="font-semibold text-clinic-ink">{rule.day}</p>
                  <p className="text-clinic-muted">
                    {rule.startTime} a {rule.endTime} · turnos de {rule.slotDurationMinutes} min
                  </p>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="text-lg font-semibold text-clinic-ink">Proximos turnos</h2>
          <div className="mt-4 space-y-3">
            {["Hoy 09:00 · Juan Gomez", "Hoy 11:30 · Laura Mendez", "Viernes 16:00 · Carla Fernandez"].map(
              (appointment) => (
                <div key={appointment} className="rounded-lg border border-clinic-line bg-clinic-surface p-3 text-sm font-medium text-clinic-ink">
                  {appointment}
                </div>
              )
            )}
          </div>
        </SectionCard>
      </section>
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
