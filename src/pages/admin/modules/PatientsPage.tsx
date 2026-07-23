import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, Edit3, FileUp, Search, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionCard } from "../../../components/admin/SectionCard";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { Button } from "../../../components/ui/Button";
import { supabase } from "../../../lib/supabase";
import {
  createPatient,
  getDefaultClinic,
  getPatients,
  searchPatients,
  updatePatient
} from "../../../lib/clinic-data";
import { Clinic, PatientInput, PatientWithAppointments } from "../../../types/clinic";
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
  coverage_id: string;
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
  coverage_id: "",
  birth_date: "",
  notes: ""
};

export function PatientsPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
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

  async function load(search = query) {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = clinic ?? (await getDefaultClinic());
      setClinic(loadedClinic);
      if (!loadedClinic) {
        setPatients([]);
        setError("No encontramos la clinica configurada. Ejecuta las migraciones y el seed inicial.");
        return;
      }
      const loadedPatients = search.trim()
        ? await searchPatients(loadedClinic.id, search)
        : await getPatients(loadedClinic.id);
      setPatients(loadedPatients);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los pacientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (clinic) load(query);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query]);

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

  function openEdit(patient: PatientWithAppointments) {
    setForm({
      id: patient.id,
      first_name: patient.first_name,
      last_name: patient.last_name,
      phone: patient.phone,
      email: patient.email ?? "",
      document_number: patient.document_number ?? "",
      insurance: patient.insurance ?? "",
      coverage_id: patient.coverage_id ?? "",
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
        coverage_id: form.coverage_id || null,
        birth_date: form.birth_date || null,
        notes: form.notes || null
      };
      if (form.id) {
        await updatePatient(form.id, payload);
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
    <AdminPageShell
      actionLabel="Crear paciente"
      description="Base operativa de pacientes con busqueda, datos administrativos e historial de turnos."
      eyebrow="Gestion de pacientes"
      onAction={openCreate}
      title="Pacientes"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}

      <div className="flex flex-wrap gap-2">
        <Link to="/admin/importaciones?type=patients" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-clinic-line bg-white px-3 py-2 text-sm font-semibold text-clinic-ink hover:bg-clinic-surface"><FileUp size={16} /> Importar pacientes</Link>
        <Button icon={<Download size={16} />} onClick={exportPatients}>Exportar pacientes</Button>
        <Button icon={<Download size={16} />} onClick={downloadTemplate}>Descargar plantilla CSV</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_240px]">
        <DateRangeFilter timezone={clinic?.timezone ?? "America/Argentina/Mendoza"} defaultPreset="this_month" onChange={setRange} />
        <label className="rounded-lg border border-clinic-line bg-white p-4 text-sm font-medium text-clinic-ink shadow-sm">Filtro temporal<select value={temporalFilter} onChange={(event) => setTemporalFilter(event.target.value as typeof temporalFilter)} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm"><option value="all">Sin filtro temporal</option><option value="created">Fecha de alta</option><option value="last_appointment">Último turno</option><option value="next_appointment">Próximo turno</option><option value="inactive">Sin actividad</option></select></label>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Pacientes cargados" value={String(totals.total)} />
        <Metric label="Pacientes nuevos del período" value={String(totals.newPatients)} />
        <Metric label="Con turnos en el período" value={String(totals.withAppointmentsInPeriod)} />
        <Metric label="Sin actividad" value={String(Math.max(totals.total - totals.withAppointments, 0))} />
      </section>

      {formOpen && (
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">{form.id ? "Editar paciente" : "Crear paciente"}</h2>
          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Nombre" value={form.first_name} onChange={(value) => setForm({ ...form, first_name: value })} required />
            <Input label="Apellido" value={form.last_name} onChange={(value) => setForm({ ...form, last_name: value })} required />
            <Input label="Telefono / WhatsApp" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required />
            <Input label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} type="email" />
            <Input label="DNI" value={form.document_number} onChange={(value) => setForm({ ...form, document_number: value })} />
            <CoverageAutocomplete
              value={form.insurance}
              coverageId={form.coverage_id}
              onChange={(insurance, coverage_id) => setForm({ ...form, insurance, coverage_id })}
            />
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

      <SectionCard className="p-5">
        <div className="relative max-w-xl">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, telefono, DNI o email..."
            className="h-11 w-full rounded-lg border border-clinic-line bg-clinic-surface pl-10 pr-4 text-sm outline-none focus:border-clinic-brand focus:bg-white focus:ring-4 focus:ring-teal-100"
          />
        </div>
      </SectionCard>

      {loading ? (
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
                <article key={patient.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1fr_170px_170px_1fr_220px] lg:items-center">
                  <div>
                    <Link
                      to={`/admin/pacientes/${patient.id}`}
                      className="font-semibold text-clinic-ink hover:text-clinic-brand hover:underline"
                    >
                      {patient.first_name} {patient.last_name}
                    </Link>
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
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={`/admin/pacientes/${patient.id}`}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-clinic-line bg-white px-4 py-2 text-sm font-semibold text-clinic-ink shadow-[0_2px_8px_rgba(13,54,66,0.025)] transition hover:bg-[#e6f4f1]"
                    >
                      Ver ficha
                    </Link>
                    <Button icon={<Edit3 size={16} />} onClick={() => openEdit(patient)}>
                      Editar
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      )}
    </AdminPageShell>
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

type CoverageOption = { id: string; name: string };

function CoverageAutocomplete({
  value,
  coverageId,
  onChange
}: {
  value: string;
  coverageId: string;
  onChange: (insurance: string, coverageId: string) => void;
}) {
  const [options, setOptions] = useState<CoverageOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const { data } = await supabase
        .from("health_coverages")
        .select("id, name")
        .eq("active", true)
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(8);
      if (!cancelled) setOptions(data ?? []);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [value]);

  return (
    <label className="relative">
      <span className="text-sm font-medium text-clinic-ink">Obra social</span>
      <input
        value={value}
        onChange={(event) => { onChange(event.target.value, ""); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Buscá OSDE, PAMI, Swiss Medical..."
        autoComplete="off"
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      />
      {coverageId && <p className="mt-1 text-xs text-emerald-700">Vinculada al catálogo oficial.</p>}
      {open && !coverageId && options.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-clinic-line bg-white p-1.5 shadow-[0_18px_42px_rgba(13,54,66,0.12)]">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(option.name, option.id); setOpen(false); }}
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-clinic-surface"
            >
              {option.name}
            </button>
          ))}
        </div>
      )}
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
