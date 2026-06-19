import { Copy, ExternalLink, ToggleRight } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { buildPublicUrl } from "../../../lib/public-url";
import { AdminPageShell } from "./AdminPageShell";

export function OnlineBookingPage() {
  const bookingLinks = [
    buildPublicUrl("/reservar/clinica-central"),
    buildPublicUrl("/reservar/clinica-central/odontologia"),
    buildPublicUrl("/reservar/clinica-central/dr-laura-perez")
  ];

  return (
    <AdminPageShell
      description="Controla que puede elegir el paciente, con cuanta anticipacion reserva y que datos son obligatorios."
      eyebrow="Canal publico"
      title="Reservas online"
    >
      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <SectionCard className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-clinic-ink">Link publico activo</h2>
              <p className="mt-1 text-sm text-clinic-muted">
                Los pacientes pueden solicitar turnos desde mobile y confirmar por WhatsApp.
              </p>
            </div>
            <ToggleRight className="text-clinic-brand" size={34} />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Setting label="Paciente puede elegir profesional" value="Activado" />
            <Setting label="Paciente puede elegir especialidad" value="Activado" />
            <Setting label="Confirmacion manual" value="Activada" />
            <Setting label="Anticipacion minima" value="12 horas" />
            <Setting label="Anticipacion maxima" value="45 dias" />
            <Setting label="Datos obligatorios" value="Nombre, telefono, motivo" />
          </div>
        </SectionCard>
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">Links disponibles</h2>
          <div className="mt-4 space-y-3">
            {bookingLinks.map((link) => (
              <div key={link} className="rounded-lg border border-clinic-line bg-clinic-surface p-3">
                <p className="truncate text-sm font-medium text-clinic-ink">{link}</p>
                <div className="mt-3 flex gap-2">
                  <Button icon={<Copy size={15} />}>Copiar</Button>
                  <Button icon={<ExternalLink size={15} />}>Abrir</Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Notificaciones automaticas</h2>
        <p className="mt-1 text-sm text-clinic-muted">
          Configuracion preparada para emails transaccionales de reservas. WhatsApp real queda para una integracion posterior.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Toggle label="Enviar email al paciente cuando solicita turno" checked />
          <Toggle label="Enviar email cuando se confirma" checked />
          <Toggle label="Enviar email cuando se cancela" checked />
          <Toggle label="Enviar recordatorio por email" />
          <Toggle label="Preparar WhatsApp futuro" />
        </div>
      </SectionCard>
    </AdminPageShell>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-clinic-line bg-clinic-surface p-4">
      <p className="text-sm text-clinic-muted">{label}</p>
      <p className="mt-1 font-semibold text-clinic-ink">{value}</p>
    </div>
  );
}

function Toggle({ label, checked = false }: { label: string; checked?: boolean }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-clinic-line bg-clinic-surface px-4 py-3">
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <input defaultChecked={checked} type="checkbox" />
    </label>
  );
}
