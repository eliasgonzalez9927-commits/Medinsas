import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Copy, CreditCard, Clock3, MessageCircle, Plus, RefreshCw, Search, UserCheck, UserX } from "lucide-react";
import { AppointmentStatusBadge } from "../../../components/admin/AppointmentStatusBadge";
import { NoActiveClinicState } from "../../../components/admin/NoActiveClinicState";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import { useActiveClinic } from "../../../contexts/ActiveClinicContext";
import {
  cancelAppointment,
  confirmAppointment,
  createAppointment,
  createOverbooking,
  createPatient,
  getAppointments,
  getAvailableSlots,
  getLocations,
  getClinicMembers,
  getPatients,
  getProfessionals,
  getServices,
  markAppointmentCompleted,
  markAppointmentNoShow
  ,zonedDateTimeToUtcIso
} from "../../../lib/clinic-data";
import { supabase } from "../../../lib/supabase";
import { DateRangeValue, resolveDateRange } from "../../../lib/date-range";
import { DateRangeFilter } from "../../../components/admin/DateRangeFilter";
import { useAuth } from "../../../contexts/AuthContext";
import { canCreateOverbooking } from "../../../lib/permissions";
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
import { useAutoRefresh } from "../../../hooks/useAutoRefresh";

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

type OverbookingForm = {
  patient_id: string;
  professional_id: string;
  service_id: string;
  location_id: string;
  date: string;
  time: string;
  duration_minutes: string;
  reason: string;
  authorized_by: string;
  notes: string;
  confirmed: boolean;
};

type DateAvailability = {
  date: string;
  slots: AvailableSlot[];
};

const today = new Date().toISOString().slice(0, 10);

export function AgendaPage() {
  const { role, user } = useAuth();
  const { activeClinic: clinic, loading: clinicLoading } = useActiveClinic();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [patients, setPatients] = useState<PatientWithAppointments[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [professionalId, setProfessionalId] = useState("all");
  const [serviceId, setServiceId] = useState("all");
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [range, setRange] = useState<DateRangeValue>(() => resolveDateRange("today"));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [availableDates, setAvailableDates] = useState<DateAvailability[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [overbookingOpen, setOverbookingOpen] = useState(false);
  const [overbookingSaving, setOverbookingSaving] = useState(false);
  const [overbookingWarnings, setOverbookingWarnings] = useState<string[]>([]);
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [quickPatient, setQuickPatient] = useState({ first_name: "", last_name: "", phone: "" });
  const [members, setMembers] = useState<Array<{ user_id: string; profiles: { full_name: string } | null }>>([]);
  const [overbookingForm, setOverbookingForm] = useState<OverbookingForm>({ patient_id: "", professional_id: "", service_id: "", location_id: "", date: today, time: "09:00", duration_minutes: "30", reason: "", authorized_by: "", notes: "", confirmed: false });
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

  // Soft refresh: recarga solo turnos sin bloquear la UI (no setLoading).
  // Usada por el hook de auto-refresh; loadBase() sigue siendo el hard load inicial.
  const softRefresh = useCallback(async () => {
    await loadAppointments();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id, range.dateFrom, range.dateTo, professionalId, serviceId, status]);

  const { lastRefreshedAt, isRefreshing, isOnline, refresh } = useAutoRefresh(softRefresh, {
    intervalMs: 30_000,
    pauseWhenHidden: true,
  });

  async function loadBase() {
    if (!clinic) return;
    setLoading(true);
    setError("");
    try {
      const [professionalResult, serviceResult, loadedPatients, loadedLocations] = await Promise.all([
        getProfessionals(clinic.id),
        getServices(clinic.id),
        getPatients(clinic.id),
        getLocations(clinic.id)
      ]);
      const activeProfessionals = professionalResult.data.filter((item) => item.active);
      const activeServices = serviceResult.data.filter((item) => item.active);
      setProfessionals(activeProfessionals);
      setServices(activeServices);
      setPatients(loadedPatients);
      setLocations(loadedLocations);
      setMembers((await getClinicMembers(clinic.id).catch(() => [])).map((member) => ({ user_id: member.user_id, profiles: member.profiles ? { full_name: member.profiles.full_name } : null })));
      setForm((current) => ({
        ...current,
        patient_id: current.patient_id || loadedPatients[0]?.id || "",
        professional_id: current.professional_id || activeProfessionals[0]?.id || "",
        service_id: current.service_id || activeServices[0]?.id || "",
        location_id: current.location_id || loadedLocations[0]?.id || ""
      }));
      await loadAppointments(clinic.id, clinic.timezone ?? "America/Argentina/Mendoza");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAppointments(clinicId = clinic?.id, timezone = clinic?.timezone ?? "America/Argentina/Mendoza") {
    if (!clinicId) return;
    const loadedAppointments = await getAppointments(clinicId, {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      timezone,
      professionalId,
      serviceId,
      status
    });
    setAppointments(loadedAppointments);
  }

  useEffect(() => {
    if (clinic) loadBase();
  }, [clinic?.id]);

  useEffect(() => {
    setSearchQuery(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!clinic) return;
    setLoading(true);
    loadAppointments(clinic.id)
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar la agenda."))
      .finally(() => setLoading(false));
  }, [range.dateFrom, range.dateTo, professionalId, serviceId, status]);

  useEffect(() => {
    if (!clinic || !form.professional_id || !form.service_id || !form.date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    getAvailableSlots({
      clinicId: clinic.id,
      professionalId: form.professional_id,
      serviceId: form.service_id,
      locationId: form.location_id || null,
      date: form.date,
      timezone: clinic.timezone ?? "America/Argentina/Mendoza"
    })
      .then((available) => {
        if (cancelled) return;
        setSlots(available);
        setForm((current) => ({
          ...current,
          slot_starts_at: available.some((slot) => slot.startsAt === current.slot_starts_at)
            ? current.slot_starts_at
            : available[0]?.startsAt ?? ""
        }));
        setAvailabilityMessage(
          available.length > 0
            ? `Horarios disponibles para ${formatDateLabel(form.date)}.`
            : "No hay horarios disponibles para esta fecha."
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar horarios."));
    return () => {
      cancelled = true;
    };
  }, [clinic?.id, form.professional_id, form.service_id, form.location_id, form.date]);

  useEffect(() => {
    if (!clinic || !form.professional_id || !form.service_id) {
      setAvailableDates([]);
      setAvailabilityMessage("");
      return;
    }

    const activeClinic = clinic;
    let cancelled = false;
    async function loadUpcomingAvailability() {
      setAvailabilityLoading(true);
      setAvailabilityMessage("Buscando próximas fechas disponibles...");
      try {
        const found: DateAvailability[] = [];
        for (let index = 0; index < 60 && found.length < 7; index += 1) {
          const date = addDaysToDateString(today, index);
          const available = await getAvailableSlots({
            clinicId: activeClinic.id,
            professionalId: form.professional_id,
            serviceId: form.service_id,
            locationId: form.location_id || null,
            date,
            timezone: activeClinic.timezone ?? "America/Argentina/Mendoza"
          });
          if (cancelled) return;
          if (available.length > 0) found.push({ date, slots: available });
        }
        if (cancelled) return;
        setAvailableDates(found);
        if (found[0]) {
          setForm((current) => {
            if (
              current.professional_id !== form.professional_id ||
              current.service_id !== form.service_id ||
              current.location_id !== form.location_id
            ) {
              return current;
            }
            return {
              ...current,
              date: current.date && found.some((item) => item.date === current.date) ? current.date : found[0].date,
              slot_starts_at: current.slot_starts_at || found[0].slots[0]?.startsAt || ""
            };
          });
          setAvailabilityMessage(`Primer turno disponible: ${formatDateLabel(found[0].date)} a las ${found[0].slots[0]?.time}.`);
        } else {
          setSlots([]);
          setAvailabilityMessage("No encontramos disponibilidad en los próximos 60 días para este profesional y servicio.");
        }
      } catch (err) {
        if (!cancelled) setAvailabilityMessage(err instanceof Error ? err.message : "No pudimos calcular la próxima disponibilidad.");
      } finally {
        if (!cancelled) setAvailabilityLoading(false);
      }
    }

    loadUpcomingAvailability();
    return () => {
      cancelled = true;
    };
  }, [clinic?.id, form.professional_id, form.service_id, form.location_id]);

  const metrics = useMemo(() => {
    return {
      pending: appointments.filter((item) => item.status === "pending").length,
      noShow: appointments.filter((item) => item.status === "no_show").length,
      whatsapp: appointments.filter((item) => item.whatsapp_status === "pending").length,
      freeSlots: slots.length
    };
  }, [appointments, slots]);

  const visibleAppointments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return appointments;

    return appointments.filter((appointment) => {
      const values = [
        appointment.public_code,
        appointment.patient?.first_name,
        appointment.patient?.last_name,
        appointment.patient?.document_number,
        appointment.patient?.phone,
        appointment.professional?.name,
        appointment.professional?.last_name,
        appointment.service?.name
      ];
      return values.filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [appointments, searchQuery]);

  function openCreate() {
    setFormOpen(true);
    setNotice("");
    setForm((current) => ({
      ...current,
      date: "",
      slot_starts_at: "",
      patient_id: current.patient_id || patients[0]?.id || "",
      professional_id: current.professional_id || professionals[0]?.id || "",
      service_id: current.service_id || services[0]?.id || "",
      location_id: current.location_id || locations[0]?.id || "",
      reason: current.reason || services[0]?.name || ""
    }));
  }

  function resetAvailabilitySelection(update: Partial<AppointmentForm>) {
    setSlots([]);
    setAvailableDates([]);
    setAvailabilityMessage("");
    setForm((current) => ({
      ...current,
      ...update,
      date: "",
      slot_starts_at: ""
    }));
  }

  function selectFirstAvailability() {
    const first = availableDates[0];
    if (!first) {
      setAvailabilityMessage("No encontramos disponibilidad en los próximos 60 días para este profesional y servicio.");
      return;
    }
    setForm((current) => ({
      ...current,
      date: first.date,
      slot_starts_at: first.slots[0]?.startsAt ?? ""
    }));
    setAvailabilityMessage(`Primer turno disponible: ${formatDateLabel(first.date)} a las ${first.slots[0]?.time}.`);
  }

  function selectAvailableDate(date: string) {
    const option = availableDates.find((item) => item.date === date);
    setForm((current) => ({
      ...current,
      date,
      slot_starts_at: option?.slots[0]?.startsAt ?? ""
    }));
  }

  function selectManualDate(date: string) {
    setForm((current) => ({
      ...current,
      date,
      slot_starts_at: ""
    }));
  }

  function openOverbooking() {
    const service = services[0];
    setOverbookingWarnings([]);
    setQuickPatientOpen(false);
    setOverbookingForm({
      patient_id: patients[0]?.id ?? "",
      professional_id: professionals[0]?.id ?? "",
      service_id: service?.id ?? "",
      location_id: locations[0]?.id ?? "",
      date: selectedDate,
      time: "09:00",
      duration_minutes: String(service?.duration_minutes ?? 30),
      reason: "",
      authorized_by: user?.id ?? "",
      notes: "",
      confirmed: false
    });
    setOverbookingOpen(true);
  }

  async function handleCreateOverbooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clinic || !canCreateOverbooking(role)) return;
    if (!overbookingForm.reason.trim()) return setError("Indica el motivo del sobreturno.");
    setOverbookingSaving(true);
    setError("");
    try {
      let patientId = overbookingForm.patient_id;
      if (quickPatientOpen) {
        if (!quickPatient.first_name.trim() || !quickPatient.last_name.trim() || !quickPatient.phone.trim()) throw new Error("Completa nombre, apellido y teléfono del paciente.");
        const createdPatient = await createPatient({ clinic_id: clinic.id, ...quickPatient });
        patientId = createdPatient.id;
        setPatients((current) => [{ ...createdPatient, appointments: [] }, ...current]);
      }
      if (!patientId) throw new Error("Selecciona o crea un paciente.");
      const startsAt = zonedDateTimeToUtcIso(overbookingForm.date, overbookingForm.time, clinic.timezone ?? "America/Argentina/Mendoza");
      const duration = Math.max(Number(overbookingForm.duration_minutes) || 30, 5);
      const endTime = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
      const sameDay = await getAppointments(clinic.id, { date: overbookingForm.date, timezone: clinic.timezone ?? undefined, professionalId: overbookingForm.professional_id });
      const conflict = sameDay.find((appointment) => appointment.status !== "cancelled" && new Date(appointment.starts_at).getTime() < new Date(endTime).getTime() && new Date(appointment.end_time ?? appointment.starts_at).getTime() > new Date(startsAt).getTime());
      const availableSlots = await getAvailableSlots({ clinicId: clinic.id, professionalId: overbookingForm.professional_id, serviceId: overbookingForm.service_id, locationId: overbookingForm.location_id || null, date: overbookingForm.date, timezone: clinic.timezone ?? "America/Argentina/Mendoza" });
      const warnings = [
        ...(conflict ? ["Este horario ya tiene un turno asignado. El sobreturno se agregará como excepción."] : []),
        ...(!conflict && !availableSlots.some((slot) => slot.startsAt === startsAt) ? ["Este horario está fuera de la disponibilidad configurada del profesional."] : [])
      ];
      setOverbookingWarnings(warnings);
      if (!overbookingForm.confirmed) throw new Error("Confirmá que querés crear esta excepción interna.");
      await createOverbooking({
        clinic_id: clinic.id,
        patient_id: patientId,
        professional_id: overbookingForm.professional_id,
        service_id: overbookingForm.service_id,
        location_id: overbookingForm.location_id || null,
        starts_at: startsAt,
        end_time: endTime,
        appointment_type: "in_person",
        status: "confirmed",
        source: "manual",
        reason: overbookingForm.reason.trim(),
        notes: overbookingForm.notes || null,
        overbooking_reason: overbookingForm.reason.trim(),
        overbooking_authorized_by: overbookingForm.authorized_by || user?.id || null,
        overbooking_notes: overbookingForm.notes || null,
        overbooking_conflict_appointment_id: conflict?.id ?? null
      });
      setNotice("Sobreturno creado como excepción interna.");
      setOverbookingOpen(false);
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear el sobreturno.");
    } finally {
      setOverbookingSaving(false);
    }
  }

  function setAgendaPreset(preset: "today" | "this_week" | "this_month" | "custom") {
    const next = new URLSearchParams(searchParams);
    next.set("preset", preset);
    if (preset !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    setSearchParams(next, { replace: true });
  }

  async function refreshAgenda() {
    setLoading(true);
    setError("");
    try {
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar la agenda.");
    } finally {
      setLoading(false);
    }
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
      const freshSlots = await getAvailableSlots({
        clinicId: clinic.id,
        professionalId: form.professional_id,
        serviceId: form.service_id,
        locationId: form.location_id || null,
        date: form.date,
        timezone: clinic.timezone ?? "America/Argentina/Mendoza"
      });
      if (!freshSlots.some((slot) => slot.startsAt === selectedSlot.startsAt)) {
        setSlots(freshSlots);
        setForm((current) => ({ ...current, slot_starts_at: freshSlots[0]?.startsAt ?? "" }));
        throw new Error("Ese horario ya no está disponible. Elegí otro horario o creá un sobreturno.");
      }
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
      if (action === "confirm") await confirmAppointment(id, clinic?.id);
      if (action === "cancel") await cancelAppointment(id, "Cancelado desde agenda", clinic?.id);
      if (action === "completed") await markAppointmentCompleted(id, clinic?.id);
      if (action === "no_show") await markAppointmentNoShow(id, clinic?.id);
      setNotice("Estado actualizado.");
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos actualizar el turno.");
    }
  }

  async function generatePaymentLink(appointment: AppointmentWithRelations) {
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/payments/mercadopago/create-preference", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {})
        },
        body: JSON.stringify({
          appointmentId: appointment.id,
          amountType: appointment.service?.deposit_required ? "deposit" : "full"
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.checkout_url) {
        throw new Error(payload.error === "MERCADO_PAGO_NOT_CONFIGURED" ? "Mercado Pago no esta configurado." : "No pudimos generar el link de pago.");
      }
      setPaymentLinks((current) => ({ ...current, [appointment.id]: payload.checkout_url }));
      setNotice("Link de pago generado.");
      await loadAppointments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos generar el link de pago.");
    }
  }

  function copyWhatsAppMessage(appointment: AppointmentWithRelations) {
    const message = buildManualWhatsAppMessage(appointment, clinic);
    navigator.clipboard?.writeText(message);
    setNotice("Mensaje de WhatsApp copiado.");
  }

  function openWhatsApp(appointment: AppointmentWithRelations) {
    const phone = normalizePhoneForWhatsApp(appointment.patient?.phone ?? "");
    if (!phone) return;
    const message = buildManualWhatsAppMessage(appointment, clinic);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <AdminPageShell
      actionLabel="Crear turno manual"
      description="Vista operativa para recepcion: confirma, cancela, marca ausencias y ocupa huecos libres."
      eyebrow="Agenda clinica"
      onCreateAppointment={openCreate}
      onAction={openCreate}
      onRefresh={refresh}
      lastRefreshedAt={lastRefreshedAt}
      isRefreshing={isRefreshing}
      isOnline={isOnline}
      title="Agenda"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}
      {!clinic && !clinicLoading && <NoActiveClinicState />}

      {clinic && <section className="grid gap-4 md:grid-cols-4">
        <QuickAction icon={<Clock3 size={18} />} label={`${metrics.pending} turnos sin confirmar`} />
        <QuickAction icon={<UserX size={18} />} label={`${metrics.noShow} pacientes no asistieron`} />
        <QuickAction icon={<MessageCircle size={18} />} label={`${metrics.whatsapp} recordatorios pendientes`} />
        <QuickAction icon={<UserCheck size={18} />} label={`${metrics.freeSlots} huecos disponibles`} />
      </section>}

      {clinic && formOpen && (
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
            <Select label="Profesional" value={form.professional_id} onChange={(value) => resetAvailabilitySelection({ professional_id: value })} required>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  Dr/a. {professional.name} {professional.last_name}
                </option>
              ))}
            </Select>
            <Select label="Servicio" value={form.service_id} onChange={(value) => resetAvailabilitySelection({ service_id: value, reason: services.find((item) => item.id === value)?.name ?? form.reason })} required>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
            <Select label="Sede" value={form.location_id} onChange={(value) => resetAvailabilitySelection({ location_id: value })}>
              <option value="">Todas las sedes</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
            <section className="rounded-xl border border-clinic-line bg-[#f6faf9] p-4 md:col-span-2 xl:col-span-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-semibold text-clinic-ink">Disponibilidad</h3>
                  <p className="mt-1 text-sm text-clinic-muted">
                    Los turnos manuales comunes solo se crean sobre horarios disponibles. Para excepciones usá Sobreturno.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={availabilityLoading || availableDates.length === 0} onClick={selectFirstAvailability}>
                    Primer turno disponible
                  </Button>
                  {canCreateOverbooking(role) && <Button onClick={openOverbooking}>Crear sobreturno</Button>}
                  <Button onClick={() => navigate("/admin/disponibilidad")}>
                    Gestionar disponibilidad
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-[#dcebea] bg-white px-4 py-3 text-sm font-medium text-clinic-ink">
                {availabilityLoading ? "Buscando disponibilidad..." : availabilityMessage || "Seleccioná profesional, servicio y sede para ver disponibilidad."}
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-clinic-ink">Fechas disponibles</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {availableDates.length > 0 ? availableDates.map((item) => (
                    <button
                      key={item.date}
                      type="button"
                      onClick={() => selectAvailableDate(item.date)}
                      className={`min-w-[116px] rounded-xl border px-3 py-3 text-left text-sm transition ${
                        form.date === item.date ? "border-clinic-brand bg-white text-clinic-brand shadow-sm" : "border-clinic-line bg-white text-clinic-ink hover:border-[#8FD2C6]"
                      }`}
                    >
                      <span className="block font-semibold">{formatShortDateLabel(item.date)}</span>
                      <span className="mt-1 block text-xs text-clinic-muted">{item.slots.length} horarios</span>
                    </button>
                  )) : (
                    <p className="rounded-lg border border-clinic-line bg-white px-4 py-3 text-sm text-clinic-muted">No hay fechas disponibles para esta combinación.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
                <Input label="Fecha manual" value={form.date} onChange={selectManualDate} type="date" required />
                <div>
                  <p className="text-sm font-semibold text-clinic-ink">Horarios disponibles</p>
                  {slots.length === 0 ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      No hay horarios disponibles para esta combinación.
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.startsAt}
                          type="button"
                          onClick={() => setForm((current) => ({ ...current, slot_starts_at: slot.startsAt }))}
                          className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                            form.slot_starts_at === slot.startsAt ? "border-clinic-brand bg-clinic-brand text-white" : "border-clinic-line bg-white text-clinic-ink hover:border-[#8FD2C6]"
                          }`}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
            <Select label="Modalidad" value={form.appointment_type} onChange={(value) => setForm({ ...form, appointment_type: value as "in_person" | "telemedicine" })}>
              <option value="in_person">Presencial</option>
              <option value="telemedicine">Telemedicina</option>
            </Select>
            <Input label="Motivo" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} required />
            <Input label="Notas" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} />
            <div className="flex gap-2 md:col-span-2 xl:col-span-3">
              <Button disabled={saving || patients.length === 0 || slots.length === 0 || !form.slot_starts_at} type="submit" variant="primary">
                {saving ? "Guardando..." : "Crear turno"}
              </Button>
              <Button onClick={() => setFormOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </SectionCard>
      )}

      {clinic && overbookingOpen && (
        <SectionCard className="border-amber-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-clinic-ink">Crear sobreturno</h2><p className="mt-1 text-sm text-clinic-muted">Excepción interna. No modifica ni genera disponibilidad pública.</p></div><span className="rounded-lg bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Controlado</span></div>
          <form onSubmit={handleCreateOverbooking} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {!quickPatientOpen ? <Select label="Paciente" value={overbookingForm.patient_id} onChange={(value) => setOverbookingForm({ ...overbookingForm, patient_id: value })} required>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.first_name} {patient.last_name} · {patient.phone}</option>)}</Select> : <><Input label="Nombre" value={quickPatient.first_name} onChange={(value) => setQuickPatient({ ...quickPatient, first_name: value })} required /><Input label="Apellido" value={quickPatient.last_name} onChange={(value) => setQuickPatient({ ...quickPatient, last_name: value })} required /><Input label="Teléfono" value={quickPatient.phone} onChange={(value) => setQuickPatient({ ...quickPatient, phone: value })} required /></>}
            <button type="button" onClick={() => setQuickPatientOpen((current) => !current)} className="self-end text-left text-sm font-semibold text-clinic-brand">{quickPatientOpen ? "Usar paciente existente" : "Crear paciente rápido"}</button>
            <Select label="Profesional" value={overbookingForm.professional_id} onChange={(value) => setOverbookingForm({ ...overbookingForm, professional_id: value })} required>{professionals.map((professional) => <option key={professional.id} value={professional.id}>Dr/a. {professional.name} {professional.last_name}</option>)}</Select>
            <Select label="Servicio" value={overbookingForm.service_id} onChange={(value) => { const service = services.find((item) => item.id === value); setOverbookingForm({ ...overbookingForm, service_id: value, duration_minutes: String(service?.duration_minutes ?? overbookingForm.duration_minutes) }); }} required>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</Select>
            <Input label="Fecha" value={overbookingForm.date} onChange={(value) => setOverbookingForm({ ...overbookingForm, date: value })} type="date" required />
            <Input label="Hora" value={overbookingForm.time} onChange={(value) => setOverbookingForm({ ...overbookingForm, time: value })} type="time" required />
            <Input label="Duración estimada (minutos)" value={overbookingForm.duration_minutes} onChange={(value) => setOverbookingForm({ ...overbookingForm, duration_minutes: value })} type="number" required />
            <Select label="Autoriza" value={overbookingForm.authorized_by} onChange={(value) => setOverbookingForm({ ...overbookingForm, authorized_by: value })}>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.profiles?.full_name ?? "Usuario del equipo"}</option>)}</Select>
            <label className="md:col-span-2 xl:col-span-3"><span className="text-sm font-medium text-clinic-ink">Motivo del sobreturno</span><input required value={overbookingForm.reason} onChange={(event) => setOverbookingForm({ ...overbookingForm, reason: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-clinic-line px-3 text-sm outline-none focus:border-clinic-brand" placeholder="Ej.: urgencia clínica, autorización profesional" /></label>
            <label className="md:col-span-2 xl:col-span-3"><span className="text-sm font-medium text-clinic-ink">Notas internas</span><textarea value={overbookingForm.notes} onChange={(event) => setOverbookingForm({ ...overbookingForm, notes: event.target.value })} className="mt-2 min-h-20 w-full rounded-lg border border-clinic-line px-3 py-2 text-sm outline-none focus:border-clinic-brand" /></label>
            {overbookingWarnings.map((warning) => <div key={warning} className="md:col-span-2 xl:col-span-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{warning}</div>)}
            <label className="md:col-span-2 xl:col-span-3 flex items-start gap-2 rounded-lg bg-clinic-surface p-3 text-sm text-clinic-ink"><input checked={overbookingForm.confirmed} onChange={(event) => setOverbookingForm({ ...overbookingForm, confirmed: event.target.checked })} type="checkbox" className="mt-0.5" /><span>Confirmo que este turno es una excepción interna autorizada y no debe habilitar disponibilidad pública.</span></label>
            <div className="md:col-span-2 xl:col-span-3 flex gap-2"><Button disabled={overbookingSaving || !overbookingForm.confirmed} type="submit" variant="primary">{overbookingSaving ? "Creando..." : "Crear sobreturno"}</Button><Button onClick={() => setOverbookingOpen(false)}>Cancelar</Button></div>
          </form>
        </SectionCard>
      )}

      <SectionCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-clinic-ink">Vista de agenda</h2>
            <p className="text-sm text-clinic-muted">{range.label}. Filtrá, actualizá y creá turnos desde la misma agenda.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setAgendaPreset("today")}>Día</Button>
            <Button onClick={() => setAgendaPreset("this_week")}>Semana</Button>
            <Button onClick={() => setAgendaPreset("this_month")}>Mes</Button>
            <Button onClick={() => setAgendaPreset("custom")}>Rango</Button>
            <Button icon={<RefreshCw size={16} />} onClick={refresh}>Actualizar</Button>
            <Button icon={<Plus size={16} />} onClick={openCreate} variant="primary">Nuevo turno</Button>
            {canCreateOverbooking(role) && <Button onClick={openOverbooking}>Sobreturno</Button>}
          </div>
        </div>
        <DateRangeFilter timezone={clinic?.timezone ?? "America/Argentina/Mendoza"} defaultPreset="today" onChange={(nextRange) => { setRange(nextRange); setSelectedDate(nextRange.dateFrom); }} />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_180px]">
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
        <label className="mt-4 block">
          <span className="text-sm font-medium text-clinic-ink">Buscar turno</span>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" size={16} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Código MED, paciente, DNI, teléfono, profesional o servicio"
              className="h-10 w-full rounded-lg border border-clinic-line py-2 pl-9 pr-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
            />
          </div>
        </label>
      </SectionCard>

      {clinic && <SectionCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-clinic-line px-5 py-4">
          <h2 className="font-semibold text-clinic-ink">{range.preset === "today" ? "Turnos del día" : "Turnos del período"}</h2>
          <Button icon={<Plus size={16} />} onClick={openCreate}>
            Nuevo
          </Button>
        </div>
        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">Cargando turnos...</div>
        ) : visibleAppointments.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-clinic-muted">
            No hay turnos que coincidan con los filtros o la búsqueda.
          </div>
        ) : (
          <div className="divide-y divide-clinic-line">
            {visibleAppointments.map((appointment) => (
              <article
                key={appointment.id}
                className="grid gap-4 px-5 py-4 lg:grid-cols-[90px_1fr_1fr_170px_360px] lg:items-center"
              >
                <div className="font-semibold text-clinic-brand">{formatTime(appointment.starts_at, clinic?.timezone ?? undefined)}</div>
                <div>
                  <p className="font-semibold text-clinic-ink">
                    {appointment.patient
                      ? `${appointment.patient.first_name} ${appointment.patient.last_name}`
                      : "Paciente sin vincular"}
                  </p>
                  <p className="text-sm text-clinic-muted">
                    Origen: {sourceLabel(appointment.source)} · {appointment.appointment_type === "telemedicine" ? "Telemedicina" : "Presencial"}
                  </p>
                  {appointment.public_code && <p className="mt-1 text-xs font-semibold text-clinic-brand">Código: {appointment.public_code}</p>}
                  {appointment.is_overbooking && <span className="mt-2 inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Sobreturno</span>}
                </div>
                <div>
                  <p className="font-medium text-clinic-ink">
                    Dr/a. {appointment.professional?.name ?? ""} {appointment.professional?.last_name ?? ""}
                  </p>
                  <p className="text-sm text-clinic-muted">{appointment.service?.name ?? appointment.reason}</p>
                </div>
                <div className="grid gap-2">
                  <AppointmentStatusBadge status={appointment.status} />
                  <PaymentStatusBadge status={appointment.payment_status ?? "unpaid"} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button icon={<CreditCard size={16} />} onClick={() => generatePaymentLink(appointment)}>
                    Generar link
                  </Button>
                  {paymentLinks[appointment.id] && (
                    <Button
                      icon={<Copy size={16} />}
                      onClick={() => {
                        navigator.clipboard?.writeText(paymentLinks[appointment.id]);
                        setNotice("Link copiado.");
                      }}
                    >
                      Copiar link
                    </Button>
                  )}
                  {appointment.status === "pending" && (
                    <Button onClick={() => handleStatus(appointment.id, "confirm")}>Confirmar</Button>
                  )}
                  <Button
                    icon={<Copy size={16} />}
                    onClick={() => copyWhatsAppMessage(appointment)}
                    title={appointment.patient?.phone ? "Copiar mensaje para WhatsApp" : "El paciente no tiene teléfono cargado."}
                    disabled={!appointment.patient?.phone}
                  >
                    Copiar mensaje
                  </Button>
                  <Button
                    icon={<MessageCircle size={16} />}
                    onClick={() => openWhatsApp(appointment)}
                    title={appointment.patient?.phone ? "Abrir WhatsApp" : "El paciente no tiene teléfono cargado."}
                    disabled={!appointment.patient?.phone}
                  >
                    Abrir WhatsApp
                  </Button>
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
      </SectionCard>}
    </AdminPageShell>
  );
}

function buildManualWhatsAppMessage(appointment: AppointmentWithRelations, clinic: Clinic | null) {
  const patientName = appointment.patient
    ? `${appointment.patient.first_name} ${appointment.patient.last_name}`.trim()
    : "paciente";
  const clinicName = clinic?.name ?? "Medin";
  const serviceName = appointment.service?.name ?? appointment.reason ?? "tu consulta";
  const professionalName = appointment.professional
    ? `Dr/a. ${appointment.professional.name} ${appointment.professional.last_name}`.trim()
    : "el profesional asignado";
  const appointmentDateTime = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: clinic?.timezone ?? "America/Argentina/Mendoza"
  }).format(new Date(appointment.starts_at));
  const publicTurnUrl = getPublicTurnUrl(appointment);
  const details = publicTurnUrl ? ` Podés ver los detalles acá: ${publicTurnUrl}` : "";
  return `Hola ${patientName}, te confirmamos tu turno en ${clinicName} para ${serviceName} con ${professionalName} el ${appointmentDateTime}.${details}`;
}

function getPublicTurnUrl(appointment: AppointmentWithRelations) {
  const link = (appointment.public_links ?? []).find((item) => {
    if (item.revoked_at) return false;
    if (!item.expires_at) return true;
    return new Date(item.expires_at).getTime() > Date.now();
  });
  if (!link?.token) return "";
  return `${window.location.origin}/mi-turno/${link.token}`;
}

function normalizePhoneForWhatsApp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("54")) return digits;
  if (digits.startsWith("0")) return `54${digits.slice(1)}`;
  return `54${digits}`;
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

function formatTime(value: string, timezone = "America/Argentina/Mendoza") {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone
  }).format(new Date(value));
}

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatShortDateLabel(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${date}T12:00:00Z`));
}

function addDaysToDateString(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
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

function PaymentStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    unpaid: "Sin pago",
    deposit_pending: "Seña pendiente",
    deposit_paid: "Seña pagada",
    paid: "Pagado",
    rejected: "Rechazado",
    refunded: "Reembolsado"
  };
  const tone = ["deposit_paid", "paid"].includes(status)
    ? "bg-emerald-50 text-emerald-700"
    : status === "deposit_pending"
      ? "bg-amber-50 text-amber-700"
      : ["rejected", "refunded"].includes(status)
        ? "bg-red-50 text-red-700"
        : "bg-clinic-surface text-clinic-muted";
  return <span className={`rounded-lg px-2.5 py-1 text-center text-xs font-semibold ${tone}`}>{labels[status] ?? status}</span>;
}

function Message({ tone, children }: { tone: "success" | "error"; children: string }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}
