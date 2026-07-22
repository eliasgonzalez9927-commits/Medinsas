import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Sparkles } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { getDefaultClinic } from "../../../lib/clinic-data";
import { buildPublicUrl } from "../../../lib/public-url";
import { AdminPageShell } from "./AdminPageShell";
import { SettingsTabsNav } from "./SettingsPage";

const UPCOMING_CAPABILITIES = [
  "Disponibilidad pública",
  "Servicios visibles para el paciente",
  "Reglas de seña / pago online",
  "Límites de anticipación mínima y máxima",
  "Mensajes automáticos para pacientes",
  "Link público de reserva"
];

export function OnlineBookingPage() {
  const navigate = useNavigate();
  const [copyNotice, setCopyNotice] = useState("");
  const [clinicSlug, setClinicSlug] = useState<string | null>(null);
  const publicLink = buildPublicUrl(`/reservar/${clinicSlug ?? "clinica-central"}`);

  useEffect(() => {
    getDefaultClinic()
      .then((clinic) => setClinicSlug(clinic?.slug ?? null))
      .catch(() => undefined);
  }, []);

  async function copyPublicLink() {
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopyNotice("Link copiado.");
    } catch {
      setCopyNotice(`No pudimos copiar el link. Usá: ${publicLink}`);
    }
  }

  return (
    <AdminPageShell
      actionLabel="Ver agenda"
      description="Estamos preparando este módulo para que puedas controlar cómo los pacientes reservan turnos online. Por ahora, la configuración desde esta pantalla todavía no está activa."
      eyebrow="Canal público"
      onAction={() => navigate("/admin/agenda")}
      title="Reservas online"
    >
      <SettingsTabsNav activeTab="booking" />
      <SectionCard className="max-w-2xl p-6">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
          <Sparkles size={20} />
        </span>
        <h2 className="mt-4 text-lg font-semibold text-clinic-ink">Configuración avanzada próximamente</h2>
        <p className="mt-2 text-sm leading-6 text-clinic-muted">
          Cuando esté lista, vas a poder configurar desde acá:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-clinic-muted">
          {UPCOMING_CAPABILITIES.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-clinic-brand" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-clinic-muted">
          No se simulan acciones ni integraciones hasta que el flujo esté listo para operar.
        </p>
      </SectionCard>

      <SectionCard className="max-w-2xl p-6">
        <h2 className="font-semibold text-clinic-ink">Mientras tanto, podés gestionar los turnos desde Agenda.</h2>
        <div className="mt-4">
          <Button onClick={() => navigate("/admin/agenda")} variant="primary">
            Ver agenda
          </Button>
        </div>
      </SectionCard>

      <SectionCard className="max-w-2xl p-6">
        <h2 className="font-semibold text-clinic-ink">Link público de reserva</h2>
        <p className="mt-1 text-sm text-clinic-muted">
          Este es el link que ya podés compartir con pacientes para que soliciten turnos online.
        </p>
        <div className="mt-4 rounded-lg border border-clinic-line bg-clinic-surface p-3">
          <p className="truncate text-sm font-medium text-clinic-ink">{publicLink}</p>
          <div className="mt-3">
            <Button icon={<Copy size={15} />} onClick={copyPublicLink}>
              Copiar link público
            </Button>
          </div>
          {copyNotice && <p className="mt-2 text-sm text-clinic-muted">{copyNotice}</p>}
        </div>
      </SectionCard>
    </AdminPageShell>
  );
}
