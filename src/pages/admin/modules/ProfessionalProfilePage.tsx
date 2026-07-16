import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, Copy, Stethoscope } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { getProfessionalById, updateProfessional } from "../../../lib/clinic-data";
import { buildPublicUrl } from "../../../lib/public-url";
import { ProfessionalWithRelations } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

const dayLabels = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

export function ProfessionalProfilePage() {
  const { id } = useParams();
  const [professional, setProfessional] = useState<ProfessionalWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Settlement section state
  const [shareInput, setShareInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      setError("");
      try {
        const prof = await getProfessionalById(id);
        setProfessional(prof);
        const current = prof?.professional_share_percentage;
        setShareInput(current != null ? String(current) : "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No pudimos cargar el profesional.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSaveShare() {
    if (!id) return;
    setSaveError("");
    setSaveOk(false);

    const trimmed = shareInput.trim();
    let parsed: number | null = null;

    if (trimmed !== "") {
      parsed = parseFloat(trimmed);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        setSaveError("El porcentaje debe estar entre 0 y 100.");
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateProfessional(id, { professional_share_percentage: parsed });
      setProfessional((prev) => prev ? { ...prev, professional_share_percentage: updated.professional_share_percentage } : prev);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "No pudimos guardar el porcentaje.");
    } finally {
      setSaving(false);
    }
  }

  const shareNum = shareInput.trim() !== "" ? parseFloat(shareInput) : null;
  const shareValid = shareNum === null || (!isNaN(shareNum) && shareNum >= 0 && shareNum <= 100);
  const clinicShare = shareNum != null && shareValid && !isNaN(shareNum) ? 100 - shareNum : null;
  const exampleBase = 10000;
  const exampleProf = shareNum != null && shareValid && !isNaN(shareNum) ? exampleBase * (shareNum / 100) : null;
  const exampleClinica = exampleProf != null ? exampleBase - exampleProf : null;

  if (loading) {
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

      {/* Rendición */}
      <SectionCard className="scroll-mt-24 p-5" id="rendicion">
        <h2 className="text-lg font-semibold text-clinic-ink">Rendición</h2>
        <p className="mt-1 text-sm text-clinic-muted">
          El porcentaje define cómo se reparte cada atención cobrada entre el profesional y la clínica. Se usa
          para estimar la liquidación del profesional en Ingresos/Pagos.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-clinic-ink" htmlFor="prof-share">
              Porcentaje para el profesional (%)
            </label>
            <input
              id="prof-share"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={shareInput}
              onChange={(e) => {
                setShareInput(e.target.value);
                setSaveError("");
                setSaveOk(false);
              }}
              placeholder="Sin configurar"
              className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-sm text-clinic-ink outline-none focus:ring-2 focus:ring-clinic-brand/30 ${
                !shareValid && shareInput.trim() !== ""
                  ? "border-red-400 bg-red-50"
                  : "border-clinic-line bg-white"
              }`}
            />
            {!shareValid && shareInput.trim() !== "" && (
              <p className="mt-1 text-xs text-red-600">El porcentaje debe estar entre 0 y 100.</p>
            )}
          </div>

          <div>
            <p className="block text-sm font-medium text-clinic-ink">
              Porcentaje para la clínica (%)
            </p>
            <div className="mt-1.5 rounded-lg border border-clinic-line bg-clinic-surface px-3 py-2 text-sm text-clinic-muted">
              {clinicShare != null ? `${clinicShare % 1 === 0 ? clinicShare : clinicShare.toFixed(2)}%` : "—"}
            </div>
          </div>
        </div>

        {exampleProf != null && exampleClinica != null && (
          <p className="mt-4 rounded-lg bg-teal-50 px-4 py-2.5 text-sm text-teal-800">
            Ejemplo con {formatARS(exampleBase)}: profesional{" "}
            <span className="font-semibold">{formatARS(exampleProf)}</span> · clínica{" "}
            <span className="font-semibold">{formatARS(exampleClinica)}</span>
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Button
            onClick={handleSaveShare}
            disabled={saving || (!shareValid && shareInput.trim() !== "")}
          >
            {saving ? "Guardando..." : "Guardar"}
          </Button>
          {saveOk && (
            <span className="text-sm font-medium text-teal-600">Guardado correctamente.</span>
          )}
          {saveError && (
            <span className="text-sm text-red-600">{saveError}</span>
          )}
        </div>

        {shareInput.trim() === "" && (
          <p className="mt-3 text-xs text-clinic-muted">
            Sin porcentaje configurado. Se mostrará una advertencia en el módulo de Ingresos.
          </p>
        )}
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

function formatARS(value: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
