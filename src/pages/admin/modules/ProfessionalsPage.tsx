import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, Copy, Download, Edit3, FileUp, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import {
  createProfessional,
  getDefaultClinic,
  getProfessionals,
  toggleProfessionalStatus,
  updateProfessional
} from "../../../lib/clinic-data";
import { Clinic, ProfessionalInput, ProfessionalWithRelations } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

type FormState = {
  id?: string;
  name: string;
  last_name: string;
  email: string;
  phone: string;
  license_number: string;
  bio: string;
  consultation_minutes: number;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  last_name: "",
  email: "",
  phone: "",
  license_number: "",
  bio: "",
  consultation_minutes: 30,
  active: true
};

export function ProfessionalsPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fromFallback, setFromFallback] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) {
        setError("No encontramos la clinica configurada. Ejecuta las migraciones y el seed inicial.");
        setProfessionals([]);
        return;
      }
      const result = await getProfessionals(loadedClinic.id);
      setProfessionals(result.data);
      setFromFallback(result.fromFallback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los profesionales.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm(emptyForm);
    setFormOpen(true);
    setNotice("");
  }

  function openEdit(professional: ProfessionalWithRelations) {
    setForm({
      id: professional.id,
      name: professional.name,
      last_name: professional.last_name,
      email: professional.email ?? "",
      phone: professional.phone ?? "",
      license_number: professional.license_number ?? "",
      bio: professional.bio ?? "",
      consultation_minutes: professional.consultation_minutes,
      active: professional.active
    });
    setFormOpen(true);
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinic) return;
    setSaving(true);
    setError("");
    try {
      const payload: ProfessionalInput = {
        clinic_id: clinic.id,
        name: form.name,
        last_name: form.last_name,
        email: form.email || null,
        phone: form.phone || null,
        license_number: form.license_number || null,
        bio: form.bio || null,
        consultation_minutes: Number(form.consultation_minutes),
        active: form.active
      };
      if (form.id) {
        await updateProfessional(form.id, payload);
        setNotice("Profesional actualizado correctamente.");
      } else {
        await createProfessional(payload);
        setNotice("Profesional creado correctamente.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el profesional.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(professional: ProfessionalWithRelations) {
    if (professional.clinic_id === "demo") {
      setError("Para activar o desactivar profesionales, primero ejecuta el seed real en Supabase.");
      return;
    }
    try {
      await toggleProfessionalStatus(professional.id, !professional.active);
      setNotice(!professional.active ? "Profesional activado." : "Profesional desactivado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cambiar el estado.");
    }
  }

  async function copyBookingLink(professional: ProfessionalWithRelations) {
    const slug = professional.slug ?? professional.id;
    const link = `${window.location.origin}/reservar/clinica-central/${slug}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Link de reserva copiado.");
    } catch {
      setError(`No pudimos copiar el link. Usa: ${link}`);
    }
  }

  function downloadTemplate() {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob(["nombre,apellido,email,telefono,especialidad,matricula,activo,bio"], { type: "text/csv;charset=utf-8" }));
    anchor.download = "profesionales_template.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  function exportProfessionals() {
    const lines = ["nombre,apellido,email,telefono,matricula,activo,bio", ...professionals.map((item) => [item.name, item.last_name, item.email ?? "", item.phone ?? "", item.license_number ?? "", item.active, item.bio ?? ""].map((value) => `\"${String(value).replace(/\"/g, '\"\"')}\"`).join(","))];
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    anchor.download = "profesionales.csv";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  return (
    <AdminPageShell
      actionLabel="Crear profesional"
      description="Gestiona la cartilla medica, especialidades, servicios y agenda de cada profesional."
      eyebrow="Equipo clinico"
      onAction={openCreate}
      title="Profesionales"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {fromFallback && (
        <Message tone="warning">
          Mostrando datos demo. Ejecuta `004_connect_operational_base.sql` para usar Supabase real.
        </Message>
      )}
      {error && <Message tone="error">{error}</Message>}
      <div className="flex flex-wrap gap-2"><Link to="/admin/importaciones" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-clinic-line bg-white px-3 py-2 text-sm font-semibold text-clinic-ink"><FileUp size={16} /> Importar profesionales</Link><Button icon={<Download size={16} />} onClick={exportProfessionals}>Exportar profesionales</Button><Button icon={<Download size={16} />} onClick={downloadTemplate}>Descargar plantilla CSV</Button></div>

      {formOpen && (
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">
            {form.id ? "Editar profesional" : "Crear profesional"}
          </h2>
          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Nombre" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
            <Input label="Apellido" value={form.last_name} onChange={(value) => setForm({ ...form, last_name: value })} required />
            <Input label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" />
            <Input label="Telefono" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
            <Input label="Matricula" value={form.license_number} onChange={(value) => setForm({ ...form, license_number: value })} />
            <Input
              label="Duracion consulta"
              value={String(form.consultation_minutes)}
              onChange={(value) => setForm({ ...form, consultation_minutes: Number(value) })}
              type="number"
            />
            <label className="md:col-span-2">
              <span className="text-sm font-medium text-clinic-ink">Bio / notas</span>
              <textarea
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-clinic-line px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? "Guardando..." : "Guardar profesional"}
              </Button>
              <Button onClick={() => setFormOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <LoadingState />
      ) : professionals.length === 0 ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          {professionals.map((professional) => (
            <SectionCard key={professional.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-clinic-ink">
                    Dr/a. {professional.name} {professional.last_name}
                  </h2>
                  <p className="mt-1 text-sm text-clinic-muted">
                    {professional.specialties.map((item) => item.name).join(", ") || "Sin especialidad asignada"}
                  </p>
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
                <Info label="Matricula" value={professional.license_number ?? "Sin cargar"} />
                <Info label="Email" value={professional.email ?? "Sin email"} />
                <Info label="Duracion" value={`${professional.consultation_minutes} min`} />
                <Info label="Servicios" value={String(professional.services.length)} />
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={`/admin/profesionales/${professional.slug ?? professional.id}`}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink transition hover:bg-clinic-surface"
                >
                  <CalendarDays size={16} />
                  Ver agenda
                </Link>
                <Button icon={<Edit3 size={16} />} onClick={() => openEdit(professional)}>
                  Editar
                </Button>
                <Button onClick={() => handleToggle(professional)}>
                  {professional.active ? "Desactivar" : "Activar"}
                </Button>
                <Button icon={<Copy size={16} />} onClick={() => copyBookingLink(professional)}>Copiar link</Button>
              </div>
            </SectionCard>
          ))}
        </section>
      )}
    </AdminPageShell>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      />
    </label>
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

function LoadingState() {
  return <div className="rounded-lg border border-clinic-line bg-white p-8 text-center text-clinic-muted">Cargando profesionales...</div>;
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <SectionCard className="p-8 text-center">
      <h2 className="font-semibold text-clinic-ink">No hay profesionales cargados.</h2>
      <p className="mt-2 text-sm text-clinic-muted">
        Agrega el primer profesional para comenzar a configurar la agenda.
      </p>
      <Button className="mt-5" icon={<Plus size={16} />} onClick={onCreate} variant="primary">
        Agregar profesional
      </Button>
    </SectionCard>
  );
}

function Message({ children, tone }: { children: string; tone: "success" | "warning" | "error" }) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-700"
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}
