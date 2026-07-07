import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, Copy, Stethoscope } from "lucide-react";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import { getProfessionalById } from "../../../lib/clinic-data";
import { buildPublicUrl } from "../../../lib/public-url";
import { ProfessionalWithRelations } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

const dayLabels = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export function ProfessionalProfilePage() {
  const { id } = useParams();
  const { activeClinic: clinic, loading: clinicLoading } = useActiveClinic();
  const [professional, setProfessional] = useState<ProfessionalWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!id) return;
      if (!clinic) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        setProfessional(await getProfessionalById(id, clinic.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pudimos cargar el profesional.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, clinic?.id]);

  if (!clinic && !clinicLoading) {
    return (
      <AdminPageShell description="Selecciona una clinica activa para ver el perfil profesional." eyebrow="Perfil profesional" title="Profesional">
        <NoActiveClinicState />
      </AdminPageShell>
    );
  }

  if (loading || clinicLoading) {
    return (
      <AdminPageShell description="Cargando datos del profesional." eyebrow="Perfil profesional" title="Profesional">
        <div className="rounded-lg border border-clinic-line bg-white p-8 text-center text-clinic-muted">
          Cargando profesional...
        </div>
      </AdminPageShell>
    );
  }

  if (!professional || error) {
    return (
      <AdminPageShell
        description="Verifica que el profesional exista o que el seed inicial este cargado."
        eyebrow="Perfil profesional"
        title="No encontramos este profesional"
      >
        <SectionCard className="p-8 text-center">
          <p className="text-clinic-muted">
            {error || "No encontramos este profesional."}
          </p>
        </SectionCard>
      </AdminPageShell>
    );
  }

  const bookingLink = buildPublicUrl(`/reservar/clinica-central/${professional.slug ?? professional.id}`);

  return (
    <AdminPageShell
      description="Datos, servicios, agenda, disponibilidad y link publico filtrado por profesional."
      eyebrow="Perfil profesional"
      title={`Dr/a. ${professional.name} ${professional.last_name}`}
    >
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <SectionCard className="p-5">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
            <Stethoscope size={24} />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-clinic-ink">Datos basicos</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label="Email" value={professional.email ?? "Sin email"} />
            <Info label="Telefono" value={professional.phone ?? "Sin telefono"} />
            <Info label="Matricula" value={professional.license_number ?? "Sin cargar"} />
            <Info label="Duracion promedio" value={`${professional.consultation_minutes} min`} />
          </dl>
          <p className="mt-5 text-sm leading-6 text-clinic-muted">
            {professional.bio ?? "Sin biografia cargada."}
          </p>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="text-lg font-semibold text-clinic-ink">Servicios y especialidades</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {professional.specialties.length === 0 ? (
              <span className="text-sm text-clinic-muted">Sin especialidades asignadas</span>
            ) : (
              professional.specialties.map((specialty) => (
                <span key={specialty.id} className="rounded-lg bg-teal-50 px-3 py-1 text-sm font-semibold text-clinic-brand">
                  {specialty.name}
                </span>
              ))
            )}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {professional.services.length === 0 ? (
              <p className="text-sm text-clinic-muted">Sin servicios asignados.</p>
            ) : (
              professional.services.map((service) => (
                <div key={service.id} className="rounded-lg border border-clinic-line bg-clinic-surface p-3 text-sm font-medium text-clinic-ink">
                  {service.name}
                </div>
              ))
            )}
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
            {!professional.availability_rules || professional.availability_rules.length === 0 ? (
              <p className="text-sm text-clinic-muted">No hay reglas cargadas para este profesional.</p>
            ) : (
              professional.availability_rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-clinic-line p-3 text-sm">
                  <p className="font-semibold text-clinic-ink">{dayLabels[rule.day_of_week]}</p>
                  <p className="text-clinic-muted">
                    {rule.start_time.slice(0, 5)} a {rule.end_time.slice(0, 5)} · turnos de{" "}
                    {rule.slot_duration_minutes} min
                  </p>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="text-lg font-semibold text-clinic-ink">Proximos turnos</h2>
          <p className="mt-3 text-sm text-clinic-muted">
            Proximo paso: conectar esta vista con `appointments` filtrado por `professional_id`.
          </p>
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
