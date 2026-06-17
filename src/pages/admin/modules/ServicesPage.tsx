import { FormEvent, useEffect, useState } from "react";
import { BadgeDollarSign, Clock3, Edit3, Plus } from "lucide-react";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import {
  createService,
  getDefaultClinic,
  getServices,
  getSpecialties,
  toggleServiceStatus,
  updateService
} from "../../../lib/clinic-data";
import { Clinic, ServiceInput, ServiceWithRelations, Specialty } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

type FormState = {
  id?: string;
  name: string;
  specialty_id: string;
  description: string;
  duration_minutes: number;
  price: string;
  deposit_required: boolean;
  financing_enabled: boolean;
  public_booking_enabled: boolean;
};

const emptyForm: FormState = {
  name: "",
  specialty_id: "",
  description: "",
  duration_minutes: 30,
  price: "",
  deposit_required: false,
  financing_enabled: false,
  public_booking_enabled: true
};

export function ServicesPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
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
        setServices([]);
        return;
      }
      const [serviceResult, loadedSpecialties] = await Promise.all([
        getServices(loadedClinic.id),
        getSpecialties(loadedClinic.id)
      ]);
      setServices(serviceResult.data);
      setFromFallback(serviceResult.fromFallback);
      setSpecialties(loadedSpecialties);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los servicios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({ ...emptyForm, specialty_id: specialties[0]?.id ?? "" });
    setFormOpen(true);
    setNotice("");
  }

  function openEdit(service: ServiceWithRelations) {
    setForm({
      id: service.id,
      name: service.name,
      specialty_id: service.specialty_id ?? "",
      description: service.description ?? "",
      duration_minutes: service.duration_minutes,
      price: service.price ? String(service.price) : "",
      deposit_required: service.deposit_required,
      financing_enabled: service.financing_enabled,
      public_booking_enabled: service.public_booking_enabled
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
      const payload: ServiceInput = {
        clinic_id: clinic.id,
        name: form.name,
        specialty_id: form.specialty_id || null,
        description: form.description || null,
        duration_minutes: Number(form.duration_minutes),
        price: form.price ? Number(form.price) : null,
        active: true,
        deposit_required: form.deposit_required,
        financing_enabled: form.financing_enabled,
        public_booking_enabled: form.public_booking_enabled
      };
      if (form.id) {
        await updateService(form.id, payload);
        setNotice("Servicio actualizado correctamente.");
      } else {
        await createService(payload);
        setNotice("Servicio creado correctamente.");
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(service: ServiceWithRelations) {
    if (service.clinic_id === "demo") {
      setError("Para activar o desactivar servicios, primero ejecuta el seed real en Supabase.");
      return;
    }
    try {
      await toggleServiceStatus(service.id, !service.active);
      setNotice(!service.active ? "Servicio activado." : "Servicio desactivado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cambiar el estado.");
    }
  }

  return (
    <AdminPageShell
      actionLabel="Crear servicio"
      description="Configura tratamientos, duracion, precio, profesionales asignados y reglas comerciales."
      eyebrow="Catalogo clinico"
      onAction={openCreate}
      title="Servicios y tratamientos"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {fromFallback && (
        <Message tone="warning">
          Mostrando datos demo. Ejecuta `004_connect_operational_base.sql` para usar Supabase real.
        </Message>
      )}
      {error && <Message tone="error">{error}</Message>}

      {formOpen && (
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">{form.id ? "Editar servicio" : "Crear servicio"}</h2>
          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <Input label="Nombre" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
            <label>
              <span className="text-sm font-medium text-clinic-ink">Especialidad</span>
              <select
                value={form.specialty_id}
                onChange={(event) => setForm({ ...form, specialty_id: event.target.value })}
                className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              >
                <option value="">Sin especialidad</option>
                {specialties.map((specialty) => (
                  <option key={specialty.id} value={specialty.id}>
                    {specialty.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Duracion"
              value={String(form.duration_minutes)}
              onChange={(value) => setForm({ ...form, duration_minutes: Number(value) })}
              type="number"
            />
            <Input label="Precio" value={form.price} onChange={(value) => setForm({ ...form, price: value })} type="number" />
            <label className="md:col-span-2">
              <span className="text-sm font-medium text-clinic-ink">Descripcion</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-clinic-line px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <div className="grid gap-3 md:col-span-2 sm:grid-cols-3">
              <Checkbox label="Requiere sena" checked={form.deposit_required} onChange={(checked) => setForm({ ...form, deposit_required: checked })} />
              <Checkbox label="Permite financiacion" checked={form.financing_enabled} onChange={(checked) => setForm({ ...form, financing_enabled: checked })} />
              <Checkbox label="Reservable online" checked={form.public_booking_enabled} onChange={(checked) => setForm({ ...form, public_booking_enabled: checked })} />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button disabled={saving} type="submit" variant="primary">
                {saving ? "Guardando..." : "Guardar servicio"}
              </Button>
              <Button onClick={() => setFormOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </SectionCard>
      )}

      {loading ? (
        <div className="rounded-lg border border-clinic-line bg-white p-8 text-center text-clinic-muted">Cargando servicios...</div>
      ) : services.length === 0 ? (
        <SectionCard className="p-8 text-center">
          <h2 className="font-semibold text-clinic-ink">No hay servicios cargados.</h2>
          <p className="mt-2 text-sm text-clinic-muted">Crea los servicios que los pacientes podran reservar.</p>
          <Button className="mt-5" icon={<Plus size={16} />} onClick={openCreate} variant="primary">
            Crear servicio
          </Button>
        </SectionCard>
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          {services.map((service) => (
            <SectionCard key={service.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-clinic-ink">{service.name}</h2>
                  <p className="mt-1 text-sm text-clinic-muted">
                    {service.specialty?.name ?? "Sin especialidad"}
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    service.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {service.active ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                <p className="flex items-center gap-2 text-clinic-muted">
                  <Clock3 size={16} /> {service.duration_minutes} minutos
                </p>
                <p className="flex items-center gap-2 text-clinic-muted">
                  <BadgeDollarSign size={16} /> {currency.format(service.price ?? 0)}
                </p>
                <p className="text-clinic-muted">
                  Profesionales:{" "}
                  <span className="font-medium text-clinic-ink">
                    {service.professionals.map((item) => `${item.name} ${item.last_name}`).join(", ") || "Sin asignar"}
                  </span>
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {service.public_booking_enabled && <Pill>Reserva online</Pill>}
                {service.deposit_required && <Pill tone="warning">Requiere sena</Pill>}
                {service.financing_enabled && <Pill tone="info">Permite financiacion</Pill>}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button icon={<Edit3 size={16} />} onClick={() => openEdit(service)}>
                  Editar
                </Button>
                <Button onClick={() => handleToggle(service)}>{service.active ? "Desactivar" : "Activar"}</Button>
              </div>
            </SectionCard>
          ))}
        </section>
      )}
    </AdminPageShell>
  );
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
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

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg border border-clinic-line p-3 text-sm font-medium text-clinic-ink">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Pill({ children, tone = "success" }: { children: string; tone?: "success" | "warning" | "info" }) {
  const classes = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    info: "bg-blue-50 text-blue-700"
  }[tone];
  return <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}

function Message({ children, tone }: { children: string; tone: "success" | "warning" | "error" }) {
  const classes = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-700"
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`}>{children}</div>;
}
