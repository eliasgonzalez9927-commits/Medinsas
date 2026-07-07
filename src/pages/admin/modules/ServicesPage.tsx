import { FormEvent, useEffect, useState } from "react";
import { BadgeDollarSign, Clock3, Download, Edit3, FileUp, Plus, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import {
  createService,
  getServices,
  getSpecialties,
  toggleServiceStatus,
  updateService
} from "../../../lib/clinic-data";
import { ServiceInput, ServiceWithRelations, Specialty } from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";
import { supabase } from "../../../lib/supabase";

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
  payment_required: boolean;
  deposit_amount: string;
  allow_online_payment: boolean;
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
  payment_required: false,
  deposit_amount: "",
  allow_online_payment: true,
  financing_enabled: false,
  public_booking_enabled: true
};

function downloadServicesTemplate() {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob(["nombre,especialidad,duracion_minutos,precio,seña,requiere_pago_online,activo,descripcion"], { type: "text/csv;charset=utf-8" }));
  anchor.download = "servicios_template.csv";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function ServicesPage() {
  const { activeClinic: clinic, loading: clinicLoading } = useActiveClinic();
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fromFallback, setFromFallback] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"percent" | "fixed" | "deposit" | "duration">("percent");
  const [bulkValue, setBulkValue] = useState("");

  async function load() {
    if (!clinic) return;
    setLoading(true);
    setError("");
    try {
      const [serviceResult, loadedSpecialties] = await Promise.all([
        getServices(clinic.id),
        getSpecialties(clinic.id)
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
    if (clinic) load();
  }, [clinic?.id]);

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
      payment_required: Boolean(service.payment_required),
      deposit_amount: service.deposit_amount ? String(service.deposit_amount) : "",
      allow_online_payment: service.allow_online_payment !== false,
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
        payment_required: form.payment_required,
        deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : null,
        allow_online_payment: form.allow_online_payment,
        financing_enabled: form.financing_enabled,
        public_booking_enabled: form.public_booking_enabled
      };
      if (form.id) {
        await updateService(form.id, payload, clinic.id);
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

  function exportServices() {
    const lines = ["nombre,especialidad,duracion_minutos,precio,seña,requiero_pago_online,activo,descripcion", ...services.map((service) => [service.name, service.specialty?.name ?? "", service.duration_minutes, service.price ?? "", service.deposit_amount ?? "", service.allow_online_payment !== false, service.active, service.description ?? ""].map((value) => `\"${String(value).replace(/\"/g, '\"\"')}\"`).join(","))];
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })); anchor.download = "servicios.csv"; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  async function applyBulk() {
    if (!clinic || !selected.size || !bulkValue) return;
    const chosen = services.filter((service) => selected.has(service.id));
    const preview = chosen.slice(0, 3).map((service) => service.name).join(", ");
    if (!window.confirm(`Esta acción modificará ${chosen.length} servicios. Vista previa: ${preview}${chosen.length > 3 ? "..." : ""}`)) return;
    setSaving(true); setError("");
    try {
      for (const service of chosen) {
        const value = Number(bulkValue);
        const update = bulkMode === "percent" ? { price: Math.round(Number(service.price ?? 0) * (1 + value / 100)) } : bulkMode === "fixed" ? { price: Math.max(0, Number(service.price ?? 0) + value) } : bulkMode === "deposit" ? { deposit_amount: Math.max(0, value), deposit_required: value > 0, allow_online_payment: value > 0 } : { duration_minutes: Math.max(5, value) };
        const { error: updateError } = await supabase.from("services").update({ ...update, updated_at: new Date().toISOString() }).eq("id", service.id).eq("clinic_id", clinic.id);
        if (updateError) throw updateError;
      }
      await supabase.from("audit_logs").insert({ clinic_id: clinic.id, action: bulkMode === "percent" || bulkMode === "fixed" ? "services_bulk_price_update" : "services_bulk_update", entity_type: "services", metadata: { ids: [...selected], mode: bulkMode, value: Number(bulkValue) } });
      setNotice(`Actualizamos ${selected.size} servicios.`); setSelected(new Set()); setBulkOpen(false); setBulkValue(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No pudimos aplicar los cambios masivos."); } finally { setSaving(false); }
  }

  return (
    <AdminPageShell
      actionLabel="Crear servicio"
      description="Configura tratamientos, duracion, precio, profesionales asignados y reglas comerciales."
      eyebrow="Catalogo clinico"
      onAction={openCreate}
      onRefresh={load}
      title="Servicios y tratamientos"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {fromFallback && (
        <Message tone="warning">
          Mostrando datos demo. Ejecuta `004_connect_operational_base.sql` para usar Supabase real.
        </Message>
      )}
      {error && <Message tone="error">{error}</Message>}
      {!clinic && !clinicLoading && <NoActiveClinicState />}
      {clinic && <div className="flex flex-wrap gap-2"><Link to="/admin/importaciones" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-clinic-line bg-white px-3 py-2 text-sm font-semibold text-clinic-ink"><FileUp size={16} /> Importar servicios</Link><Button icon={<Download size={16} />} onClick={exportServices}>Exportar servicios</Button><Button icon={<Download size={16} />} onClick={() => downloadServicesTemplate()}>Descargar plantilla CSV</Button><Button icon={<SlidersHorizontal size={16} />} onClick={() => setBulkOpen((open) => !open)}>{bulkOpen ? "Cerrar edición masiva" : "Actualizar precios"}</Button></div>}

      {clinic && bulkOpen && <SectionCard className="p-5"><h2 className="font-semibold">Vista previa de cambios</h2><p className="mt-1 text-sm text-clinic-muted">Seleccioná servicios y confirmá el cambio antes de aplicarlo.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]"><select value={bulkMode} onChange={(event) => setBulkMode(event.target.value as typeof bulkMode)} className="h-10 rounded-lg border border-clinic-line px-3 text-sm"><option value="percent">Aumentar precio por porcentaje</option><option value="fixed">Aumentar precio por monto fijo</option><option value="deposit">Reemplazar seña</option><option value="duration">Reemplazar duración</option></select><input value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} type="number" placeholder={bulkMode === "percent" ? "Ej. 20" : "Monto / minutos"} className="h-10 rounded-lg border border-clinic-line px-3 text-sm"/><Button disabled={!selected.size || !bulkValue || saving} onClick={applyBulk} variant="primary">Aplicar a {selected.size} servicios</Button></div></SectionCard>}

      {clinic && formOpen && (
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
            <Input label="Monto de seña" value={form.deposit_amount} onChange={(value) => setForm({ ...form, deposit_amount: value })} type="number" />
            <label className="md:col-span-2">
              <span className="text-sm font-medium text-clinic-ink">Descripcion</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-clinic-line px-3 py-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
              />
            </label>
            <div className="grid gap-3 md:col-span-2 sm:grid-cols-5">
              <Checkbox label="Requiere seña" checked={form.deposit_required} onChange={(checked) => setForm({ ...form, deposit_required: checked })} />
              <Checkbox label="Requiere pago" checked={form.payment_required} onChange={(checked) => setForm({ ...form, payment_required: checked })} />
              <Checkbox label="Pago online" checked={form.allow_online_payment} onChange={(checked) => setForm({ ...form, allow_online_payment: checked })} />
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

      {clinic && (loading ? (
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
                <label className="flex items-center gap-2 text-xs font-semibold text-clinic-muted"><input type="checkbox" checked={selected.has(service.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(service.id) : next.delete(service.id); return next; })} /> Seleccionar</label><span
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
                {(service.payment_required || service.deposit_required) && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                    Pago online {service.deposit_required ? `· Seña ${currency.format(service.deposit_amount ?? 0)}` : "requerido"}
                  </p>
                )}
                <p className="text-clinic-muted">
                  Profesionales:{" "}
                  <span className="font-medium text-clinic-ink">
                    {service.professionals.map((item) => `${item.name} ${item.last_name}`).join(", ") || "Sin asignar"}
                  </span>
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {service.public_booking_enabled && <Pill>Reserva online</Pill>}
                {service.deposit_required && <Pill tone="warning">Requiere seña</Pill>}
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
      ))}
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
