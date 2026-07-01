import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Download, Edit3, FileUp, Search, UserPlus, X } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionCard } from "../../../components/admin/SectionCard";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import {
  createPatient,
  getPatients,
  searchPatients,
  updatePatient
} from "../../../lib/clinic-data";
import { PatientInput, PatientWithAppointments } from "../../../types/clinic";
import { DateRangeValue, isDateInRange, resolveDateRange } from "../../../lib/date-range";
import { AdminPageShell } from "./AdminPageShell";

type PatientForm = {
  id?: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  document_number: string;
  insurance: string;
  birth_date: string;
  notes: string;
};

const emptyForm: PatientForm = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  document_number: "",
  insurance: "",
  birth_date: "",
  notes: ""
};

export function PatientsPage() {
  const { activeClinic: clinic, loading: clinicLoading } = useActiveClinic();
  const [patients, setPatients] = useState<PatientWithAppointments[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<PatientForm>(emptyForm);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("this_month"));
  const [temporalFilter, setTemporalFilter] = useState<"all" | "created" | "last_appointment" | "next_appointment" | "inactive">("all");
  const [detailPatient, setDetailPatient] = useState<PatientWithAppointments | null>(null);

  async function load(search = query) {
    if (!clinic) return;
    setLoading(true);
    setError("");
    try {
      const loadedPatients = search.trim()
        ? await searchPatients(clinic.id, search)
        : await getPatients(clinic.id);
      setPatients(loadedPatients);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los pacientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (clinic) load("");
  }, [clinic?.id]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (clinic) load(query);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [clinic?.id, query]);

  const visiblePatients = useMemo(() => patients.filter((patient) => {
    const appointments = patient.appointments ?? [];
    if (temporalFilter === "all") return true;
    if (temporalFilter === "created") return isDateInRange(patient.created_at, range, clinic?.timezone ?? undefined);
    if (temporalFilter === "inactive") return appointments.length === 0;
    const sorted = [...appointments].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const appointment = temporalFilter === "next_appointment"
      ? sorted.find((item) => new Date(item.starts_at).getTime() >= Date.now())
      : sorted.filter((item) => new Date(item.starts_at).getTime() < Date.now()).slice(-1)[0];
    return isDateInRange(appointment?.starts_at, range, clinic?.timezone ?? undefined);
  }), [clinic?.timezone, patients, range, temporalFilter]);

  const totals = useMemo(() => {
    const withAppointments = patients.filter((patient) => (patient.appointments?.length ?? 0) > 0).length;
    const newPatients = patients.filter((patient) => isDateInRange(patient.created_at, range, clinic?.timezone ?? undefined)).length;
    const withAppointmentsInPeriod = patients.filter((patient) => (patient.appointments ?? []).some((appointment) => isDateInRange(appointment.starts_at, range, clinic?.timezone ?? undefined))).length;
    return { total: patients.length, withAppointments, newPatients, withAppointmentsInPeriod };
  }, [clinic?.timezone, patients, range]);

  function downloadTemplate() {
    downloadCsv("pacientes_template.csv", ["nombre,apellido,telefono,email,dni,fecha_nacimiento,obra_social,plan,numero_afiliado,notas,email_opt_in,whatsapp_opt_in"]);
  }

  function exportPatients() {
    if (!clinic) return;
    const lines = ["nombre,apellido,telefono,email,dni,fecha_nacimiento,obra_social,notas", ...visiblePatients.map((patient) => csvLine([patient.first_name, patient.last_name, patient.phone, patient.email ?? "", patient.document_number ?? "", patient.birth_date ?? "", patient.insurance ?? "", patient.notes ?? ""]))];
    downloadCsv(`pacientes_${clinic.slug}.csv`, lines);
  }

  function openCreate() {
    setForm(emptyForm);
    setFormOpen(true);
    setNotice("");
  }

  function openDetail(patient: PatientWithAppointments) {
    setDetailPatient(patient);
  }

  function openEditFromDetail(patient: PatientWithAppointments) {
    setDetailPatient(null);
    openEdit(patient);
  }

  function openEdit(patient: PatientWithAppointments) {
    setForm({
      id: patient.id,
      first_name: patient.first_name,
      last_name: patient.last_name,
      phone: patient.phone,
      email: patient.email ?? "",
      document_number: patient.document_number ?? "",
      insurance: patient.insurance ?? "",
      birth_date: patient.birth_date ?? "",
      notes: patient.notes ?? ""
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
      const payload: PatientInput = {
        clinic_id: clinic.id,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        email: form.email || null,
        document_number: form.document_number || null,
        insurance: form.insurance || null,
        birth_date: form.birth_date || null,
        notes: form.notes || null
      };
      if (form.id) {
        await updatePatient(form.id, payload, clinic.id);
        setNotice("Paciente actualizado correctamente.");
      } else {
        await createPatient(payload);
        setNotice("Paciente creado correctamente.");
      }
      setFormOpen(false);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el paciente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <AdminPageShell
      actionLabel="Crear paciente"
      description="Base operativa de pacientes con busqueda, datos administrativos e historial de turnos."
      eyebrow="Gestion de pacientes"
      onAction={openCreate}
      onRefresh={() => load("")}
      title="Pacientes"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}
      {!clinic && !clinicLoading && <NoActiveClinicState />}

      {clinic && <div className="flex flex-wrap gap-2">
        <Link to="/admin/importaciones?type=patients" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-clinic-line bg-white px-3 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface"><FileUp size={16} /> Importar pacientes</Link>
        <Button icon={<Download size={16} />} onClick={exportPatients}>Exportar pacientes</Button>
        <Button icon={<Download size={16} />} onClick={downloadTemplate}>Descargar plantilla CSV</Button>
      </div>}

      {clinic && <div className="grid gap-4 xl:grid-cols-[1fr_240px]">
        <DateRangeFilter timezone={clinic?.timezone ?? "America/Argentina/Mendoza"} defaultPreset="this_month" onChange={setRange} />
        <label className="rounded-lg border border-clinic-line bg-white p-4 text-sm font-medium text-clinic-ink shadow-sm">Filtro temporal<select value={temporalFilter} onChange={(event) => setTemporalFilter(event.target.value as typeof temporalFilter)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm"><option value="all">Sin filtro temporal</option><option value="created">Fecha de alta</option><option value="last_appointment">Último turno</option><option value="next_appointment">Próximo turno</option><option value="inactive">Sin actividad</option></select></label>
      </div>}

      {clinic && <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Pacientes cargados" value={String(totals.total)} />
        <Metric label="Pacientes nuevos del período" value={String(totals.newPatients)} />
        <Metric label="Con turnos en el período" value={String(totals.withAppointmentsInPeriod)} />
        <Metric label="Sin actividad" value={String(Math.max(totals.total - totals.withAppointments, 0))} />
      </section>}

      {clinic && formOpen && (
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">{form.id ? "Editar paciente" : "Crear paciente"}</h2>
          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Nombre" value={form.first_name} onChange={(value) => setForm({ ...form, first_name: value })} required />
            <Input label="Apellido" value={form.last_name} onChange={(value) => setForm({ ...form, last_name: value })} required />
            <Input label="Telefono / WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required />
            <Input label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" />
            <Input label="DNI" value={form.document_number} onChange={(value) => setForm({ ...form, document_number: value })} />
            <Input label="Obra social" value={form.insurance} onChange={(value) => setForm({ ...form, insurance: value })} />
            <Input label="Fecha de nacimiento" value={form.birth_date} onChange={(value) => setForm({ ...form, birth_date: value })} type="date" />
            <label className="md:col-span-2">
              <span className="text-sm font-medium text-clinic-ink">Notas internas</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-clinic-line px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? "Guardando..." : "Guardar paciente"}
              </Button>
              <Button onClick={() => setFormOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </SectionCard>
      )}

      {clinic && <SectionCard className="p-5">
        <div className="relative max-w-xl">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, telefono, DNI o email..."
            className="h-11 w-full rounded-lg border border-clinic-line bg-clinic-surface pl-10 pr-4 text-sm outline-none focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100"
          />
        </div>
      </SectionCard>}

      {clinic && (loading ? (
        <div className="rounded-lg border border-clinic-line bg-white p-8 text-center text-clinic-muted">Cargando pacientes...</div>
      ) : visiblePatients.length === 0 ? (
        <SectionCard className="p-8 text-center">
          <h2 className="font-semibold text-clinic-ink">No hay pacientes para mostrar.</h2>
          <p className="mt-2 text-sm text-clinic-muted">Crea el primer paciente o espera reservas online entrantes.</p>
          <Button className="mt-5" icon={<UserPlus size={16} />} onClick={openCreate} variant="primary">
            Crear paciente
          </Button>
        </SectionCard>
      ) : (
        <SectionCard className="overflow-hidden">
          <div className="divide-y divide-clinic-line">
            {visiblePatients.map((patient) => {
              const nextAppointment = getNextAppointment(patient);
              return (
                <article
                  key={patient.id}
                  onClick={() => openDetail(patient)}
                  className="grid cursor-pointer gap-4 px-5 py-4 transition-colors hover:bg-clinic-surface lg:grid-cols-[1fr_170px_170px_1fr_auto] lg:items-center"
                >
                  <div>
                    <p className="font-semibold text-clinic-ink">
                      {patient.first_name} {patient.last_name}
                    </p>
                    <p className="text-sm text-clinic-muted">{patient.phone}</p>
                  </div>
                  <p className="text-sm text-clinic-muted">{patient.document_number ? `DNI ${patient.document_number}` : "Sin DNI"}</p>
                  <p className="text-sm text-clinic-muted">{patient.insurance ?? "Sin cobertura"}</p>
                  <div>
                    <p className="text-sm font-medium text-clinic-ink">
                      {nextAppointment ? formatDateTime(nextAppointment.starts_at) : "Sin proximo turno"}
                    </p>
                    <p className="text-xs text-clinic-muted">
                      {(patient.appointments?.length ?? 0)} turnos registrados
                    </p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button icon={<Edit3 size={16} />} onClick={() => openEdit(patient)}>
                      Editar
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      ))}
    </AdminPageShell>
    {detailPatient && (
      <PatientDetailDrawer
        patient={detailPatient}
        onClose={() => setDetailPatient(null)}
        onEdit={openEditFromDetail}
      />
    )}
    </>
  );
}

function getNextAppointment(patient: PatientWithAppointments) {
  const now = Date.now();
  return (patient.appointments ?? [])
    .filter((appointment) => new Date(appointment.starts_at).getTime() >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
      <p className="text-sm text-clinic-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-clinic-ink">{value}</p>
    </div>
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        required={required}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      />
    </label>
  );
}

function Message({ tone, children }: { tone: "success" | "error"; children: string }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}

function PatientDetailDrawer({
  patient,
  onClose,
  onEdit
}: {
  patient: PatientWithAppointments;
  onClose: () => void;
  onEdit: (patient: PatientWithAppointments) => void;
}) {
  const recentAppointments = [...(patient.appointments ?? [])]
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    .slice(0, 6);

  const totalAppointments = patient.appointments?.length ?? 0;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${patient.first_name} ${patient.last_name}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-clinic-line px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-clinic-brand">
              Paciente
            </p>
            <h2 className="mt-0.5 text-xl font-semibold text-clinic-ink">
              {patient.first_name} {patient.last_name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-clinic-muted transition hover:bg-clinic-surface hover:text-clinic-ink"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <DrawerSection title="Datos personales">
            <DrawerField label="DNI / Documento" value={patient.document_number ?? "—"} />
            <DrawerField
              label="Fecha de nacimiento"
              value={
                patient.birth_date
                  ? new Intl.DateTimeFormat("es-AR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC"
                    }).format(new Date(patient.birth_date + "T00:00:00Z"))
                  : "—"
              }
            />
          </DrawerSection>

          <DrawerSection title="Contacto">
            <DrawerField label="Teléfono" value={patient.phone} />
            <DrawerField label="Email" value={patient.email ?? "—"} />
          </DrawerSection>

          {patient.insurance && (
            <DrawerSection title="Cobertura médica">
              <DrawerField label="Obra social" value={patient.insurance} />
            </DrawerSection>
          )}

          <DrawerSection title="Comunicación">
            <div className="flex gap-6 text-sm">
              <span className={patient.email_opt_in !== false ? "text-emerald-700" : "text-clinic-muted"}>
                {patient.email_opt_in !== false ? "✓" : "✗"} Email
              </span>
              <span className={patient.whatsapp_opt_in !== false ? "text-emerald-700" : "text-clinic-muted"}>
                {patient.whatsapp_opt_in !== false ? "✓" : "✗"} WhatsApp
              </span>
            </div>
            {patient.communication_notes && (
              <p className="mt-1.5 text-sm text-clinic-muted leading-relaxed">{patient.communication_notes}</p>
            )}
          </DrawerSection>

          {patient.notes && (
            <DrawerSection title="Notas internas">
              <p className="text-sm text-clinic-ink leading-relaxed whitespace-pre-wrap">{patient.notes}</p>
            </DrawerSection>
          )}

          <DrawerSection
            title={`Turnos${totalAppointments > 0 ? ` · ${totalAppointments} total${totalAppointments !== 1 ? "es" : ""}` : ""}`}
          >
            {recentAppointments.length === 0 ? (
              <p className="text-sm text-clinic-muted">Sin turnos registrados.</p>
            ) : (
              <div className="space-y-2">
                {recentAppointments.map((apt) => (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-clinic-line bg-clinic-surface px-3 py-2.5"
                  >
                    <span className="text-sm font-medium text-clinic-ink tabular-nums">
                      {formatDateTime(apt.starts_at)}
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${appointmentStatusClass(apt.status)}`}>
                      {appointmentStatusLabel(apt.status)}
                    </span>
                  </div>
                ))}
                {totalAppointments > 6 && (
                  <p className="text-xs text-clinic-muted text-right">
                    Mostrando los 6 más recientes de {totalAppointments}.
                  </p>
                )}
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Registro">
            <DrawerField label="Alta" value={formatDate(patient.created_at)} />
            {patient.updated_at && (
              <DrawerField label="Última actualización" value={formatDate(patient.updated_at)} />
            )}
          </DrawerSection>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-clinic-line px-6 py-4">
          <Button variant="primary" icon={<Edit3 size={16} />} onClick={() => onEdit(patient)}>
            Editar
          </Button>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </aside>
    </>
  );
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DrawerField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-40 shrink-0 text-clinic-muted">{label}</span>
      <span className="text-clinic-ink">{value}</span>
    </div>
  );
}

function appointmentStatusLabel(status: string | null) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    attended: "Asistió",
    cancelled: "Cancelado",
    rescheduled: "Reprogramado",
    completed: "Completado",
    no_show: "No asistió"
  };
  return labels[status ?? ""] ?? status ?? "—";
}

function appointmentStatusClass(status: string | null) {
  const classes: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    confirmed: "bg-blue-50 text-blue-700",
    attended: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-red-50 text-red-600",
    rescheduled: "bg-slate-100 text-slate-600",
    completed: "bg-[#e6f4f1] text-[#0D766E]",
    no_show: "bg-orange-50 text-orange-700"
  };
  return classes[status ?? ""] ?? "bg-slate-100 text-slate-600";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function csvLine(values: string[]) {
  return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
}

function downloadCsv(filename: string, lines: string[]) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}
