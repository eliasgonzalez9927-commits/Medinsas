import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Clock3, MessageCircle, Plus, UserCheck, UserX } from "lucide-react";
import { AppointmentStatusBadge } from "../../../components/admin/AppointmentStatusBadge";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import {
  cancelAppointment,
  confirmAppointment,
  createAppointment,
  getAppointments,
  getAvailableSlots,
  getDefaultClinic,
  getLocations,
  getPatients,
  getProfessionals,
  getServices,
  markAppointmentCompleted,
  markAppointmentNoShow
} from "../../../lib/clinic-data";
import {
  AppointmentInput,
  AppointmentStatus,
  AppointmentWithRelations,
  AvailableSlot,
  Clinic,
  Location,
  PatientWithAppointments,
  ProfessionalWithRelations,
  ServiceWithRelations
} from "../../../types/clinic";
import { AdminPageShell } from "./AdminPageShell";

type AppointmentForm = {
  patient_id: string;
  professional_id: string;
  service_id: string;
  location_id: string;
  date: string;
  slot_starts_at: string;
  appointment_type: "in_person" | "telemedicine";
  reason: string;
  notes: string;
};

const today = new Date().toISOString().slice(0, 10);

export function AgendaPage() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [patients, setPatients] = useState<PatientWithAppointments[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [professionalId, setProfessionalId] = useState("all");
  const [serviceId, setServiceId] = useState("all");
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<AppointmentForm>({
    patient_id: "",
    professional_id: "",
    service_id: "",
    location_id: "",
    date: today,
    slot_starts_at: "",
    appointment_type: "in_person",
    reason: "",
    notes: ""
  });

  async function loadBase() {
    setLoading(true);
    setError("");
    try {
      const loadedClinic = await getDefaultClinic();
      setClinic(loadedClinic);
      if (!loadedClinic) {
        setError("No encontramos la clinica configurada. Ejecuta las migraciones y el seed inicial.");
        return;
      }
      const [professionalResult, serviceResult, loadedPatients, loadedLocations] = await Promise.all([
        getProfessionals(loadedClinic.id),
        getServices(loadedClinic.id),
        getPatients(loadedClinic.id),
        getLocations(loadedClinic.id)
      ]);
      const activeProfessionals = professionalResult.data.filter((item) => item.active);
      const activeServices = serviceResult.data.filter((item) => item.active);
      setProfessionals(activeProfessionals);
      setServices(activeServices);
      setPatients(loadedPatients);
      setLocations(loadedLocations);
      setForm((current) => ({
        ...current,
        patient_id: current.patient_id || loadedPatients[0]?.id || "",
        professional_id: current.professional_id || activeProfessionals[0]?.id || "",
        service_id: current.service_id || activeServices[0]?.id || "",
        location_id: current.location_id || loadedLocations[0]?.id || ""
      }));
      await loadAppointments(loadedClinic.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAppointments(clinicId = clinic?.id) {
    if (!clinicId) return;
    const loadedAppointments = await getAppointments(clinicId, {
      date: selectedDate,
      professionalId,
      serviceId,
      status
    });
    setAppointments(loadedAppointments);
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    if (!clinic) return;
    setLoading(true);
    loadAppointments(clinic.id)
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar la agenda."))
      .finally(() => setLoading(false));
  }, [selectedDate, professionalId, serviceId, status]);

  useEffect(() => {
    if (!clinic || !form.professional_id || !form.service_id || !form.date) {
      setSlots([]);
      return;
    }
    getAvailableSlots({
      clinicId: clinic.id,
      professionalId: form.professional_id,
      serviceId: form.service_id,
      date: form.date
    })
      .then((available) => {
        setSlots(available);
        setForm((current) => ({
          ...current,
          slot_starts_at: available.some((slot) => slot.startsAt === current.slot_starts_at)
            ? current.slot_starts_at
            : available[0]?.startsAt ?? ""
        }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar horarios."));
  }, [clinic?.id, form.professional_id, form.service_id, form.date]);

  const metrics = useMemo(() => {
    return {
      pending: appointments.filter((item) => item.status === "pending").length,
      noShow: appointments.filter((item) => item.status === "no_show").length,
      whatsapp: appointments.filter((item) => item.whatsapp_status === "pending").length,
      freeSlots: slots.length
    };
  }, [appointments, slots]);

  function openCreate() {
    setFormOpen(true);
    setNotice("");
    setForm((current) => ({
      ...current,
      date: selectedDate,
      patient_id: current.patient_id || patients[0]?.id || "",
      professional_id: current.professional_id || professionals[0]?.id || "",
      service_id: current.service_id || services[0]?.id || "",
      location_id: current.location_id || locations[0]?.id || "",
      reason: current.reason || services[0]?.name || ""
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinic) return;
    const selectedSlot = slots.find((slot) => slot.startsAt === form.slot_starts_at);
    if (!selectedSlot) {
      setError("Selecciona un horario disponible para crear el turno.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload: AppointmentInput = {
        clinic_id: clinic.id,
        patient_id: form.patient_id,
        professional_id: form.professional_id,
        service_id: form.service_id,
        location_id: form.location_id || null,
        starts_at: selectedSlot.startsAt,
        end_time: selectedSlot.endTime,
        appointment_type: form.appointment_type,
        status: "confirmed",
        source: "manual",
        reason: form.reason,
        notes: form.notes || null,
        whatsapp_status: "pending"
      };
      await createAppointment(payload);
      setNotice("Turno creado correctamente.");
      setFormOpen(false);
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear el turno.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(id: string, action: "confirm" | "cancel" | "completed" | "no_show") {
    setError("");
    try {
      if (action === "confirm") await confirmAppointment(id);
      if (action === "cancel") await cancelAppointment(id, "Cancelado desde agenda");
      if (action === "completed") await markAppointmentCompleted(id);
      if (action === "no_show") await markAppointmentNoShow(id);
      setNotice("Estado actualizado.");
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar el turno.");
    }
  }

  return (
    <AdminPageShell
      actionLabel="Crear turno manual"
      description="Vista operativa para recepcion: confirma, cancela, marca ausencias y ocupa huecos libres."
      eyebrow="Agenda clinica"
      onAction={openCreate}
      title="Agenda"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}

      <section className="grid gap-4 md:grid-cols-4">
        <QuickAction icon={<Clock3 size={18} />} label={`${metrics.pending} turnos sin confirmar`} />
        <QuickAction icon={<UserX size={18} />} label={`${metrics.noShow} pacientes no asistieron`} />
        <QuickAction icon={<MessageCircle size={18} />} label={`${metrics.whatsapp} recordatorios pendientes`} />
        <QuickAction icon={<UserCheck size={18} />} label={`${metrics.freeSlots} huecos disponibles`} />
      </section>

      {formOpen && (
        <SectionCard className="p-5">
          <h2 className="font-semibold text-clinic-ink">Crear turno manual</h2>
          <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Select label="Paciente" value={form.patient_id} onChange={(value) => setForm({ ...form, patient_id: value })} required>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.first_name} {patient.last_name} - {patient.phone}
                </option>
              ))}
            </Select>
            <Select label="Profesional" value={form.professional_id} onChange={(value) => setForm({ ...form, professional_id: value })} required>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  Dr/a. {professional.name} {professional.last_name}
                </option>
              ))}
            </Select>
            <Select label="Servicio" value={form.service_id} onChange={(value) => setForm({ ...form, service_id: value, reason: services.find((item) => item.id === value)?.name ?? form.reason })} required>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
            <Input label="Fecha" value={form.date} onChange={(value) => setForm({ ...form, date: value })} type="date" required />
            <Select label="Horario disponible" value={form.slot_starts_at} onChange={(value) => setForm({ ...form, slot_starts_at: value })} required>
              <option value="">Seleccionar horario</option>
              {slots.map((slot) => (
                <option key={slot.startsAt} value={slot.startsAt}>
                  {slot.time}
                </option>
              ))}
            </Select>
            <Select label="Modalidad" value={form.appointment_type} onChange={(value) => setForm({ ...form, appointment_type: value as "in_person" | "telemedicine" })}>
              <option value="in_person">Presencial</option>
              <option value="telemedicine">Telemedicina</option>
            </Select>
            <Select label="Sede" value={form.location_id} onChange={(value) => setForm({ ...form, location_id: value })}>
              <option value="">Sin sede</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
            <Input label="Motivo" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} required />
            <Input label="Notas" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
            <div className="flex gap-2 md:col-span-2 xl:col-span-3">
              <Button disabled={saving || patients.length === 0 || slots.length === 0} type="submit" variant="primary">
                {saving ? "Guardando..." : "Crear turno"}
              </Button>
              <Button onClick={() => setFormOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </SectionCard>
      )}

      <SectionCard className="p-5">
        <div className="grid gap-4 lg:grid-cols-[180px_1fr_1fr_180px]">
          <Input label="Fecha" value={selectedDate} onChange={setSelectedDate} type="date" />
          <Select label="Profesional" value={professionalId} onChange={setProfessionalId}>
            <option value="all">Todos</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                Dr/a. {professional.name} {professional.last_name}
              </option>
            ))}
          </Select>
          <Select label="Servicio" value={serviceId} onChange={setServiceId}>
            <option value="all">Todos</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
          <Select label="Estado" value={status} onChange={(value) => setStatus(value as "all" | AppointmentStatus)}>
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmado</option>
            <option value="cancelled">Cancelado</option>
            <option value="rescheduled">Reprogramado</option>
            <option value="completed">Atendido</option>
            <option value="no_show">No asistio</option>
          </Select>
        </div>
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">Turnos del dia</h2>
          <Button icon={<Plus size={16} />} onClick={openCreate}>
            Nuevo
          </Button>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">Cargando turnos...</div>
        ) : appointments.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">
            No hay turnos para los filtros seleccionados.
          </div>
        ) : (
          <div className="divide-y divide-clinic-line">
            {appointments.map((appointment) => (
              <article
                key={appointment.id}
                className="grid gap-4 px-5 py-4 lg:grid-cols-[90px_1fr_1fr_150px_300px] lg:items-center"
              >
                <div className="font-semibold text-clinic-brand">{formatTime(appointment.starts_at)}</div>
                <div>
                  <p className="font-semibold text-clinic-ink">
                    {appointment.patient
                      ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                      : "Paciente sin vincular"}
                  </p>
                  <p className="text-sm text-clinic-muted">
                    Origen: {sourceLabel(appointment.source)} · {appointment.appointment_type === "telemedicine" ? "Telemedicina" : "Presencial"}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-clinic-ink">
                    Dr/a. {appointment.professional?.name ?? ""} {appointment.professional?.last_name ?? ""}
                  </p>
                  <p className="text-sm text-clinic-muted">{appointment.service?.name ?? appointment.reason}</p>
                </div>
                <AppointmentStatusBadge status={appointment.status} />
                <div className="flex flex-wrap gap-2">
                  {appointment.status === "pending" && (
                    <Button onClick={() => handleStatus(appointment.id, "confirm")}>Confirmar</Button>
                  )}
                  {!["cancelled", "completed"].includes(appointment.status) && (
                    <>
                      <Button onClick={() => handleStatus(appointment.id, "completed")}>Atendido</Button>
                      <Button onClick={() => handleStatus(appointment.id, "no_show")}>No asistio</Button>
                      <Button onClick={() => handleStatus(appointment.id, "cancel")}>Cancelar</Button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </AdminPageShell>
  );
}

function QuickAction({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-clinic-line bg-white p-4 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-teal-50 text-clinic-brand">
        {icon}
      </div>
      <p className="text-sm font-semibold text-clinic-ink">{label}</p>
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

function Select({
  label,
  value,
  onChange,
  required = false,
  children
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label>
      <span className="text-sm font-medium text-clinic-ink">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
      >
        {children}
      </select>
    </label>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function sourceLabel(value: string) {
  const labels: Record<string, string> = {
    manual: "Manual",
    online: "Online",
    whatsapp: "WhatsApp",
    imported: "Importado"
  };
  return labels[value] ?? value;
}

function Message({ tone, children }: { tone: "success" | "error"; children: string }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}
