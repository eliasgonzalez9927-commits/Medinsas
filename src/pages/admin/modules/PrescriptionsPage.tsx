import { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BadgeAlert,
  ClipboardPlus,
  FilePenLine,
  FileText,
  Microscope,
  Settings,
  Stethoscope
} from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { AdminPageShell } from "./AdminPageShell";

const documentTypes = [
  {
    title: "Recetario interno",
    description: "Indicaciones de medicamentos o cuidados, vinculadas al paciente y al profesional."
  },
  {
    title: "Ordenes e indicaciones",
    description: "Solicitudes de estudios, practicas y seguimiento clinico."
  },
  {
    title: "Preparado para integracion con receta electronica",
    description: "Estructura lista para conectar una plataforma aprobada cuando corresponda."
  }
];

const settings = [
  "Datos del profesional",
  "Matricula profesional",
  "Especialidad",
  "Habilitacion",
  "Firma del profesional como placeholder",
  "Integracion futura con plataforma aprobada"
];

export function PrescriptionsPage() {
  return (
    <AdminPageShell
      actionLabel="Nuevo documento"
      description="Recetarios internos, ordenes de estudio e indicaciones medicas con trazabilidad clinica."
      eyebrow="Documentacion medica"
      onAction={() => window.location.assign("/admin/recetarios/nuevo")}
      title="Recetarios"
    >
      <PrescriptionNotice />

      <section className="grid gap-4 lg:grid-cols-3">
        <PreparedCard icon={<FilePenLine size={20} />} title="Recetario interno" text="Borradores, emitidos o anulados, con PDF preparado." to="/admin/recetarios/nuevo" />
        <PreparedCard icon={<Microscope size={20} />} title="Ordenes e indicaciones" text="Medicamentos, practicas, estudios y observaciones." to="/admin/recetarios/nuevo" />
        <PreparedCard icon={<Settings size={20} />} title="Configuracion" text="Matricula, especialidad, habilitacion e integracion futura." to="/admin/recetarios/configuracion" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <SectionCard className="overflow-hidden">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold text-clinic-ink">Documentos preparados</h2>
          </div>
          <div className="divide-y divide-clinic-line">
            {documentTypes.map((item) => (
              <article key={item.title} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_140px_150px] md:items-center">
                <div>
                  <p className="font-semibold text-clinic-ink">{item.title}</p>
                  <p className="mt-1 text-sm text-clinic-muted">{item.description}</p>
                </div>
                <span className="rounded-lg bg-clinic-surface px-3 py-2 text-center text-xs font-semibold text-clinic-muted">
                  Borrador
                </span>
                <Button>Preparar</Button>
              </article>
            ))}
          </div>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">Alcance inicial</h2>
          <p className="mt-2 text-sm text-clinic-muted">
            Los documentos pueden vincular paciente, profesional, turno, diagnostico o motivo, items indicados, observaciones, PDF y estado.
          </p>
          <div className="mt-4 grid gap-3">
            {["Borrador", "Emitida", "Anulada"].map((status) => (
              <div key={status} className="flex items-center gap-3 rounded-lg border border-clinic-line px-3 py-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
                  <FileText size={15} />
                </span>
                <span className="text-sm font-medium text-clinic-ink">Estado: {status}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </AdminPageShell>
  );
}

export function NewPrescriptionPage() {
  return (
    <AdminPageShell
      description="Formulario base para crear un documento medico interno sin integracion oficial activa."
      eyebrow="Recetarios"
      title="Nuevo documento"
    >
      <PrescriptionNotice />
      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Recetario interno</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {["Paciente", "Profesional", "Turno relacionado", "Diagnostico o motivo", "Matricula profesional", "Estado"].map((label) => (
            <label key={label}>
              <span className="text-sm font-medium text-clinic-ink">{label}</span>
              <input
                disabled
                placeholder="Pendiente de implementacion operativa"
                className="mt-2 h-10 w-full rounded-lg border border-clinic-line bg-clinic-surface px-3 text-sm text-clinic-muted"
              />
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-medium text-clinic-ink">Medicamentos o practicas indicadas</span>
            <textarea
              disabled
              placeholder="Items del documento medico"
              className="mt-2 min-h-28 w-full rounded-lg border border-clinic-line bg-clinic-surface px-3 py-2 text-sm text-clinic-muted"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-clinic-ink">Observaciones</span>
            <textarea
              disabled
              placeholder="Indicaciones adicionales"
              className="mt-2 min-h-28 w-full rounded-lg border border-clinic-line bg-clinic-surface px-3 py-2 text-sm text-clinic-muted"
            />
          </label>
        </div>
        <Button className="mt-5" icon={<ClipboardPlus size={16} />}>Guardar borrador</Button>
      </SectionCard>
    </AdminPageShell>
  );
}

export function PrescriptionSettingsPage() {
  return (
    <AdminPageShell
      description="Datos profesionales y preparacion para integraciones aprobadas."
      eyebrow="Recetarios"
      title="Configuracion de recetarios"
    >
      <PrescriptionNotice />
      <SectionCard className="p-5">
        <h2 className="font-semibold text-clinic-ink">Datos del profesional</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {settings.map((label) => (
            <label key={label}>
              <span className="text-sm font-medium text-clinic-ink">{label}</span>
              <input
                disabled
                placeholder="Pendiente de configuracion"
                className="mt-2 h-10 w-full rounded-lg border border-clinic-line bg-clinic-surface px-3 text-sm text-clinic-muted"
              />
            </label>
          ))}
        </div>
        <Button className="mt-5" icon={<Stethoscope size={16} />}>Guardar configuracion</Button>
      </SectionCard>
    </AdminPageShell>
  );
}

function PrescriptionNotice() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      Preparado para integracion con receta electronica. Medin trabaja por ahora como recetario interno y ordenes e indicaciones.
    </div>
  );
}

function PreparedCard({ icon, title, text, to }: { icon: ReactNode; title: string; text: string; to: string }) {
  return (
    <Link to={to} className="rounded-lg border border-clinic-line bg-white p-5 shadow-sm hover:bg-clinic-surface">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">{icon}</div>
      <h2 className="mt-4 font-semibold text-clinic-ink">{title}</h2>
      <p className="mt-2 text-sm text-clinic-muted">{text}</p>
    </Link>
  );
}
