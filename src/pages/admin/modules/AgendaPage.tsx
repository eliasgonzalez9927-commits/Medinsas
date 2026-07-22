import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  CreditCard,
  MessageCircle,
  MoreVertical,
  Plus,
  Search,
  UserCheck,
  UserX
} from "lucide-react";
import { AppointmentStatusBadge } from "../../../components/admin/AppointmentStatusBadge";
import { RegisterPaymentPanel } from "../../../components/admin/RegisterPaymentPanel";
import { SectionCard } from "../../../components/admin/SectionCard";
import { Button } from "../../../components/ui/Button";
import {
  cancelAppointment,
  confirmAppointment,
  createAppointment,
  createOverbooking,
  createPatient,
  getAppointments,
  getAvailableSlots,
  getDefaultClinic,
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
import { addDays, getDateInTimeZone } from "../../../lib/date-range";
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
  Service,
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

type ViewMode = "day" | "week" | "month";

type HuecoSlot = AvailableSlot & { professional: ProfessionalWithRelations; service: Service };

type TimelineEntry =
  | { kind: "appointment"; startsAt: string; appointment: AppointmentWithRelations }
  | { kind: "hueco"; startsAt: string; hueco: HuecoSlot };

const today = new Date().toISOString().slice(0, 10);

export function AgendaPage() {
  const { role, user, clinicMembership } = useAuth();
  const isProfessionalRole = role === "professional" || role === "doctor";
  const myProfessionalId = isProfessionalRole ? (clinicMembership?.professional_id ?? null) : null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalWithRelations[]>([]);
  const [services, setServices] = useState<ServiceWithRelations[]>([]);
  const [patients, setPatients] = useState<PatientWithAppointments[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState(today);
  const [professionalId, setProfessionalId] = useState(myProfessionalId ?? "all");
  const [status, setStatus] = useState<"all" | AppointmentStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
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
  const [paymentAppt, setPaymentAppt] = useState<AppointmentWithRelations | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [overbookingOpen, setOverbookingOpen] = useState(false);
  const [overbookingSaving, setOverbookingSaving] = useState(false);
  const [overbookingWarnings, setOverbookingWarnings] = useState<string[]>([]);
  const [quickPatientOpen, setQuickPatientOpen] = useState(false);
  const [quickPatient, setQuickPatient] = useState({ first_name: "", last_name: "", phone: "" });
  const [members, setMembers] = useState<Array<{ user_id: string; profiles: { full_name: string } | null }>>([]);
  const [huecos, setHuecos] = useState<HuecoSlot[]>([]);
  const [huecosLoading, setHuecosLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => today.slice(0, 7));
  const [monthActivity, setMonthActivity] = useState<Record<string, number>>({});
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

  const timezone = clinic?.timezone ?? "America/Argentina/Mendoza";

  const range = useMemo(() => {
    if (viewMode === "day") {
      return { dateFrom: selectedDate, dateTo: selectedDate };
    }
    if (viewMode === "week") {
      const from = mondayOf(selectedDate);
      return { dateFrom: from, dateTo: addDays(from, 6) };
    }
    const monthKey = selectedDate.slice(0, 7);
    const from = `${monthKey}-01`;
    return { dateFrom: from, dateTo: endOfMonthOf(from) };
  }, [viewMode, selectedDate]);

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
      setMembers((await getClinicMembers(loadedClinic.id).catch(() => [])).map((member) => ({ user_id: member.user_id, profiles: member.profiles ? { full_name: member.profiles.full_name } : null })));
      setForm((current) => ({
        ...current,
        patient_id: current.patient_id || loadedPatients[0]?.id || "",
        professional_id: current.professional_id || activeProfessionals[0]?.id || "",
        service_id: current.service_id || activeServices[0]?.id || "",
        location_id: current.location_id || loadedLocations[0]?.id || ""
      }));
      await loadAppointments(loadedClinic.id, loadedClinic.timezone ?? "America/Argentina/Mendoza");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAppointments(clinicId = clinic?.id, tz = timezone) {
    if (!clinicId) return;
    const loadedAppointments = await getAppointments(clinicId, {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      timezone: tz,
      professionalId,
      status
    });
    setAppointments(loadedAppointments);
  }

  useEffect(() => {
    if (isProfessionalRole && !myProfessionalId) {
      setLoading(false);
      return;
    }
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fromSearch = searchParams.get("search");
    if (fromSearch) setSearchQuery(fromSearch);
  }, [searchParams]);

  useEffect(() => {
    if (!clinic) return;
    setLoading(true);
    loadAppointments(clinic.id)
      .catch((err) => setError(err instanceof Error ? err.message : "No pudimos cargar la agenda."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.dateFrom, range.dateTo, professionalId, status]);

  // Huecos libres reales del dia seleccionado: se calculan por profesional a partir
  // de su disponibilidad cargada (availability_rules), nunca se inventan horarios.
  useEffect(() => {
    if (!clinic || viewMode !== "day" || professionals.length === 0) {
      setHuecos([]);
      return;
    }
    let cancelled = false;
    async function loadHuecos() {
      setHuecosLoading(true);
      try {
        const targets = professionalId === "all" ? professionals : professionals.filter((item) => item.id === professionalId);
        const results = await Promise.all(
          targets.map(async (professional) => {
            const service = professional.services?.[0];
            if (!service) return [] as HuecoSlot[];
            try {
              const available = await getAvailableSlots({
                clinicId: clinic!.id,
                professionalId: professional.id,
                serviceId: service.id,
                locationId: null,
                date: selectedDate,
                timezone
              });
              return available.map((slot) => ({ ...slot, professional, service }));
            } catch {
              return [] as HuecoSlot[];
            }
          })
        );
        if (cancelled) return;
        setHuecos(results.flat().sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      } finally {
        if (!cancelled) setHuecosLoading(false);
      }
    }
    loadHuecos();
    return () => {
      cancelled = true;
    };
  }, [clinic, viewMode, professionals, professionalId, selectedDate, timezone]);

  // Puntitos de actividad del mini calendario: se basan en turnos reales del mes visible.
  useEffect(() => {
    if (!clinic) return;
    let cancelled = false;
    const dateFrom = `${calendarMonth}-01`;
    const dateTo = endOfMonthOf(dateFrom);
    getAppointments(clinic.id, { dateFrom, dateTo, timezone })
      .then((rows) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        rows.forEach((appointment) => {
          if (appointment.status === "cancelled") return;
          const day = getDateInTimeZone(new Date(appointment.starts_at), timezone);
          counts[day] = (counts[day] ?? 0) + 1;
        });
        setMonthActivity(counts);
      })
      .catch(() => {
        if (!cancelled) setMonthActivity({});
      });
    return () => {
      cancelled = true;
    };
  }, [clinic, calendarMonth, timezone]);

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
      timezone
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
  }, [clinic, form.professional_id, form.service_id, form.location_id, form.date, timezone]);

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
  }, [clinic, form.professional_id, form.service_id, form.location_id]);

  const metrics = useMemo(() => {
    return {
      pending: appointments.filter((item) => item.status === "pending").length,
      noShow: appointments.filter((item) => item.status === "no_show").length,
      whatsapp: appointments.filter((item) => item.whatsapp_status === "pending").length,
      freeSlots: huecos.length
    };
  }, [appointments, huecos]);

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

  const dayTimeline = useMemo<TimelineEntry[]>(() => {
    if (viewMode !== "day") return [];
    const appointmentEntries: TimelineEntry[] = visibleAppointments.map((appointment) => ({
      kind: "appointment",
      startsAt: appointment.starts_at,
      appointment
    }));
    const huecoEntries: TimelineEntry[] =
      status === "all" && !searchQuery.trim()
        ? huecos.map((hueco) => ({ kind: "hueco", startsAt: hueco.startsAt, hueco }))
        : [];
    return [...appointmentEntries, ...huecoEntries].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [viewMode, visibleAppointments, huecos, status, searchQuery]);

  const nextAppointment = useMemo(() => {
    const now = Date.now();
    return [...visibleAppointments]
      .filter((item) => ["pending", "confirmed", "urgent", "rescheduled"].includes(item.status) && new Date(item.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0] ?? null;
  }, [visibleAppointments]);

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

  function occupySlot(hueco: HuecoSlot) {
    setFormOpen(true);
    setNotice("");
    setForm((current) => ({
      ...current,
      patient_id: current.patient_id || patients[0]?.id || "",
      professional_id: hueco.professional.id,
      service_id: hueco.service.id,
      location_id: current.location_id || locations[0]?.id || "",
      date: selectedDate,
      slot_starts_at: hueco.startsAt,
      reason: hueco.service.name
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
        timezone
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

  function goToDate(date: string) {
    setSelectedDate(date);
    setCalendarMonth(date.slice(0, 7));
    setViewMode("day");
  }

  function stepDay(delta: number) {
    setSelectedDate((current) => addDays(current, delta));
  }

  const dateLabel = useMemo(() => {
    const isToday = selectedDate === today;
    const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`));
    const short = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`));
    return {
      primary: isToday ? `Hoy, ${short}` : short,
      secondary: capitalize(weekday)
    };
  }, [selectedDate]);

  if (isProfessionalRole && !myProfessionalId) {
    return (
      <AdminPageShell description="" eyebrow="Agenda clinica" title="Mi agenda">
        <Message tone="error">
          Tu usuario no está vinculado a un profesional en esta clínica. Contactá al administrador para que
          te asocie a tu perfil profesional y puedas ver tu agenda.
        </Message>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      description="Vista operativa para recepcion: confirma, cancela, marca ausencias y ocupa huecos libres."
      eyebrow="Agenda clinica"
      onCreateAppointment={isProfessionalRole ? undefined : openCreate}
      onRefresh={refreshAgenda}
      title="Agenda"
    >
      {notice && <Message tone="success">{notice}</Message>}
      {error && <Message tone="error">{error}</Message>}

      {clinic && (
        <RegisterPaymentPanel
          open={paymentAppt !== null}
          onClose={() => setPaymentAppt(null)}
          onSaved={() => {
            setNotice("Pago registrado correctamente.");
            loadAppointments();
          }}
          clinicId={clinic.id}
          defaultValues={paymentAppt ? {
            appointmentId: paymentAppt.id,
            patientId: paymentAppt.patient_id,
            professionalId: paymentAppt.professional_id,
            serviceId: paymentAppt.service_id,
            patientName: paymentAppt.patient
              ? `${paymentAppt.patient.first_name} ${paymentAppt.patient.last_name}`.trim()
              : undefined,
            professionalName: paymentAppt.professional
              ? `Dr/a. ${paymentAppt.professional.name} ${paymentAppt.professional.last_name}`.trim()
              : undefined,
            serviceName: paymentAppt.service?.name,
            appointmentAt: paymentAppt.starts_at,
          } : undefined}
        />
      )}

      {/* Barra compacta de control de agenda */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-clinic-line bg-white px-4 py-3 shadow-[0_2px_10px_rgba(13,54,66,0.03)]">
        <div className="flex items-center gap-1">
          <IconButton label="Día anterior" onClick={() => stepDay(-1)}>
            <ChevronLeft size={17} />
          </IconButton>
          <div className="flex items-center gap-2 rounded-xl border border-clinic-line px-3 py-1.5">
            <CalendarIcon size={16} className="text-clinic-brand" />
            <div className="leading-tight">
              <p className="text-sm font-semibold text-clinic-ink">{dateLabel.primary}</p>
              <p className="text-xs text-clinic-muted">{dateLabel.secondary}</p>
            </div>
          </div>
          <IconButton label="Día siguiente" onClick={() => stepDay(1)}>
            <ChevronRight size={17} />
          </IconButton>
        </div>

        <div className="flex rounded-xl border border-clinic-line p-1">
          {(["day", "week", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                viewMode === mode ? "bg-clinic-brand text-white" : "text-clinic-muted hover:text-clinic-ink"
              }`}
            >
              {mode === "day" ? "Día" : mode === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>

        {!isProfessionalRole && (
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-clinic-muted">Profesional</span>
            <select
              value={professionalId}
              onChange={(event) => setProfessionalId(event.target.value)}
              className="h-9 rounded-lg border border-clinic-line bg-white px-2 text-sm text-clinic-ink outline-none focus:border-clinic-brand"
            >
              <option value="all">Todos</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  Dr/a. {professional.name} {professional.last_name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-clinic-muted">Estado</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as "all" | AppointmentStatus)}
            className="h-9 rounded-lg border border-clinic-line bg-white px-2 text-sm text-clinic-ink outline-none focus:border-clinic-brand"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="confirmed">Confirmado</option>
            <option value="cancelled">Cancelado</option>
            <option value="rescheduled">Reprogramado</option>
            <option value="completed">Atendido</option>
            <option value="no_show">No asistió</option>
          </select>
        </label>

        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-clinic-muted" size={15} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Buscar turno..."
            className="h-9 w-full rounded-lg border border-clinic-line py-2 pl-8 pr-3 text-sm outline-none focus:border-clinic-brand focus:ring-4 focus:ring-teal-100"
          />
        </div>

        <div className="ml-auto flex gap-2">
          {canCreateOverbooking(role) && (
            <Button onClick={openOverbooking}>Sobreturno</Button>
          )}
          {!isProfessionalRole && (
            <Button icon={<Plus size={16} />} onClick={openCreate} variant="primary">
              Nuevo turno
            </Button>
          )}
        </div>
      </div>

      {/* Mini KPIs operativos */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiChip icon={<Clock3 size={16} />} tone="amber" value={metrics.pending} label="Sin confirmar" />
        <KpiChip icon={<MessageCircle size={16} />} tone="mint" value={metrics.whatsapp} label="Recordatorios pendientes" />
        <KpiChip icon={<UserCheck size={16} />} tone="mint" value={huecosLoading ? "…" : metrics.freeSlots} label="Huecos libres" />
        <KpiChip icon={<UserX size={16} />} tone="red" value={metrics.noShow} label="Ausencias hoy" />
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
                    Configurar disponibilidad
                  </Button>
                </div>
              </div>

              {!availabilityLoading && availableDates.length === 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Este profesional no tiene disponibilidad configurada.{" "}
                  <button type="button" onClick={() => navigate("/admin/disponibilidad")} className="font-semibold underline">
                    Configurar disponibilidad
                  </button>
                </div>
              )}

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

      {overbookingOpen && (
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

      {/* Layout principal: agenda + columna lateral */}
      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <SectionCard className="overflow-visible p-0">
          <div className="border-b border-clinic-line px-5 py-4">
            <h2 className="font-semibold capitalize text-clinic-ink">
              {viewMode === "day"
                ? `${dateLabel.secondary} ${formatDateNoWeekday(selectedDate)}`
                : viewMode === "week"
                  ? `Semana del ${formatShortDateLabel(range.dateFrom)} al ${formatShortDateLabel(range.dateTo)}`
                  : formatMonthLabel(selectedDate)}
            </h2>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-clinic-muted">Cargando turnos...</div>
          ) : viewMode === "day" ? (
            dayTimeline.length === 0 ? (
              appointments.length === 0 && huecos.length === 0 ? (
                <EmptyState
                  title="No hay turnos programados para este día."
                  description="Creá un nuevo turno o revisá la disponibilidad para ocupar horarios libres."
                  actions={
                    <>
                      {!isProfessionalRole && <Button variant="primary" onClick={openCreate}>Nuevo turno</Button>}
                      <Button onClick={() => navigate("/admin/disponibilidad")}>Ver disponibilidad</Button>
                    </>
                  }
                />
              ) : (
                <EmptyState
                  title="No encontramos turnos con esos filtros."
                  description="Probá cambiar el profesional, estado o búsqueda."
                  actions={<Button onClick={() => { setProfessionalId("all"); setStatus("all"); setSearchQuery(""); }}>Limpiar filtros</Button>}
                />
              )
            ) : (
              <div className="divide-y divide-clinic-line">
                {dayTimeline.map((entry) =>
                  entry.kind === "appointment" ? (
                    <TimelineRow key={entry.appointment.id} time={formatTime(entry.startsAt, timezone)}>
                      <AppointmentCard
                        appointment={entry.appointment}
                        isProfessionalRole={isProfessionalRole}
                        myProfessionalId={myProfessionalId}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                        paymentLinks={paymentLinks}
                        onConfirm={() => handleStatus(entry.appointment.id, "confirm")}
                        onComplete={() => handleStatus(entry.appointment.id, "completed")}
                        onNoShow={() => handleStatus(entry.appointment.id, "no_show")}
                        onCancel={() => handleStatus(entry.appointment.id, "cancel")}
                        onRegisterPayment={() => setPaymentAppt(entry.appointment)}
                        onGeneratePaymentLink={() => generatePaymentLink(entry.appointment)}
                        onCopyLink={() => {
                          navigator.clipboard?.writeText(paymentLinks[entry.appointment.id]);
                          setNotice("Link copiado.");
                        }}
                        onCopyMessage={() => copyWhatsAppMessage(entry.appointment)}
                        onOpenWhatsApp={() => openWhatsApp(entry.appointment)}
                        onStartAttention={() => navigate(`/admin/mi-agenda/atencion/${entry.appointment.id}`)}
                      />
                    </TimelineRow>
                  ) : (
                    <TimelineRow key={`hueco-${entry.hueco.professional.id}-${entry.startsAt}`} time={formatTime(entry.startsAt, timezone)}>
                      <HuecoCard hueco={entry.hueco} onOcupar={() => occupySlot(entry.hueco)} disabled={isProfessionalRole} />
                    </TimelineRow>
                  )
                )}
              </div>
            )
          ) : viewMode === "week" ? (
            <WeekView
              dateFrom={range.dateFrom}
              dateTo={range.dateTo}
              appointments={visibleAppointments}
              timezone={timezone}
              onSelectDay={goToDate}
            />
          ) : (
            <MonthGrid
              month={selectedDate.slice(0, 7)}
              selectedDate={selectedDate}
              activity={monthActivity}
              onSelectDay={goToDate}
            />
          )}
        </SectionCard>

        {/* Columna derecha */}
        <div className="grid gap-4">
          <SectionCard className="border-[#cfe9e4] bg-[#f3faf9] p-4">
            <p className="text-sm font-semibold text-clinic-ink">Próximo turno</p>
            {nextAppointment ? (
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-semibold text-clinic-brand">{formatTime(nextAppointment.starts_at, timezone)}</p>
                  <span className="text-xs font-semibold text-clinic-muted">{minutesUntilLabel(nextAppointment.starts_at)}</span>
                </div>
                <p className="mt-2 font-semibold text-clinic-ink">
                  {nextAppointment.patient ? `${nextAppointment.patient.first_name} ${nextAppointment.patient.last_name}` : "Paciente sin vincular"}
                </p>
                <p className="text-sm text-clinic-muted">
                  Dr/a. {nextAppointment.professional?.name} {nextAppointment.professional?.last_name}
                </p>
                <p className="text-sm text-clinic-muted">{nextAppointment.service?.name ?? nextAppointment.reason}</p>
                <div className="mt-2"><AppointmentStatusBadge status={nextAppointment.status} /></div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-clinic-muted">Sin próximos turnos en la vista actual.</p>
            )}
          </SectionCard>

          <SectionCard className="p-4">
            <MiniCalendar
              month={calendarMonth}
              selectedDate={selectedDate}
              activity={monthActivity}
              onMonthChange={setCalendarMonth}
              onSelectDate={goToDate}
            />
          </SectionCard>

          <SectionCard className="p-4">
            <p className="text-sm font-semibold text-clinic-ink">Huecos disponibles hoy</p>
            <div className="mt-3 grid gap-2">
              {huecosLoading ? (
                <p className="text-sm text-clinic-muted">Buscando huecos...</p>
              ) : huecos.length === 0 ? (
                <p className="text-sm text-clinic-muted">No hay huecos libres para este día.</p>
              ) : (
                huecos.slice(0, 5).map((hueco) => (
                  <div key={`${hueco.professional.id}-${hueco.startsAt}`} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-[#8FD2C6] bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-clinic-ink">
                        {hueco.time} · Dr/a. {hueco.professional.name} {hueco.professional.last_name}
                      </p>
                      <p className="truncate text-xs text-clinic-muted">{hueco.professional.specialties?.[0]?.name ?? hueco.service.name}</p>
                    </div>
                    {!isProfessionalRole && (
                      <Button className="shrink-0" onClick={() => occupySlot(hueco)}>Ocupar</Button>
                    )}
                  </div>
                ))
              )}
            </div>
            {huecos.length > 5 && (
              <button type="button" onClick={() => navigate("/admin/disponibilidad")} className="mt-3 text-sm font-semibold text-clinic-brand">
                Ver todos los huecos
              </button>
            )}
          </SectionCard>
        </div>
      </section>
    </AdminPageShell>
  );
}

function TimelineRow({ time, children }: { time: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-3 px-5 py-3 sm:grid-cols-[76px_1fr]">
      <p className="pt-3 text-sm font-semibold text-clinic-brand">{time}</p>
      {children}
    </div>
  );
}

function AppointmentCard({
  appointment,
  isProfessionalRole,
  myProfessionalId,
  openMenuId,
  setOpenMenuId,
  paymentLinks,
  onConfirm,
  onComplete,
  onNoShow,
  onCancel,
  onRegisterPayment,
  onGeneratePaymentLink,
  onCopyLink,
  onCopyMessage,
  onOpenWhatsApp,
  onStartAttention
}: {
  appointment: AppointmentWithRelations;
  isProfessionalRole: boolean;
  myProfessionalId: string | null;
  openMenuId: string | null;
  setOpenMenuId: (value: string | null) => void;
  paymentLinks: Record<string, string>;
  onConfirm: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onCancel: () => void;
  onRegisterPayment: () => void;
  onGeneratePaymentLink: () => void;
  onCopyLink: () => void;
  onCopyMessage: () => void;
  onOpenWhatsApp: () => void;
  onStartAttention: () => void;
}) {
  const tone =
    appointment.status === "pending"
      ? "border-l-amber-400 bg-amber-50/40"
      : appointment.status === "cancelled" || appointment.status === "no_show"
        ? "border-l-red-300 bg-red-50/40"
        : appointment.is_overbooking
          ? "border-l-clinic-brand bg-[#E6F4F1]/50"
          : "border-l-[#8FD2C6] bg-[#F3FAF9]";

  return (
    <article className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-l-4 border-clinic-line ${tone} px-4 py-3`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {appointment.patient ? (
            <Link
              to={isProfessionalRole ? `/admin/mi-agenda/pacientes/${appointment.patient_id}` : `/admin/pacientes/${appointment.patient_id}`}
              className="font-semibold text-clinic-ink hover:text-clinic-brand hover:underline"
            >
              {appointment.patient.first_name} {appointment.patient.last_name}
            </Link>
          ) : (
            <p className="font-semibold text-clinic-ink">Paciente sin vincular</p>
          )}
          {appointment.is_overbooking && <span className="rounded-md bg-[#E6F4F1] px-2 py-0.5 text-xs font-semibold text-clinic-brand">Sobreturno</span>}
        </div>
        <p className="mt-0.5 text-xs text-clinic-muted">
          {appointment.patient?.document_number ? `DNI ${appointment.patient.document_number} · ` : ""}
          {appointment.public_code ?? ""}
        </p>
        <p className="text-xs text-clinic-muted">Origen: {sourceLabel(appointment.source)}</p>
      </div>

      {!isProfessionalRole && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-clinic-ink">
            Dr/a. {appointment.professional?.name ?? ""} {appointment.professional?.last_name ?? ""}
          </p>
        </div>
      )}

      <div className="min-w-0">
        <p className="truncate text-sm text-clinic-ink">{appointment.service?.name ?? appointment.reason}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <AppointmentStatusBadge status={appointment.status} />
        <PaymentStatusBadge status={appointment.payment_status ?? "unpaid"} />
      </div>

      <div className="flex items-center gap-1.5">
        {isProfessionalRole && appointment.professional_id === myProfessionalId && !["cancelled", "completed"].includes(appointment.status) && (
          <Button onClick={onStartAttention} variant="primary">Iniciar atención</Button>
        )}
        {!isProfessionalRole && appointment.status === "pending" && (
          <IconButton label="Confirmar" onClick={onConfirm}>
            <UserCheck size={16} />
          </IconButton>
        )}
        {appointment.patient?.phone && (
          <IconButton label="Abrir WhatsApp" onClick={onOpenWhatsApp}>
            <MessageCircle size={16} />
          </IconButton>
        )}
        <div className="relative">
          <IconButton
            label="Más acciones"
            onClick={() => setOpenMenuId(openMenuId === appointment.id ? null : appointment.id)}
          >
            <MoreVertical size={16} />
          </IconButton>
          {openMenuId === appointment.id && (
            <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-clinic-line bg-white p-1.5 shadow-[0_18px_42px_rgba(13,54,66,0.12)]" role="menu">
              {!isProfessionalRole && appointment.status === "pending" && (
                <AppointmentMenuItem icon={<UserCheck size={16} />} onClick={() => { onConfirm(); setOpenMenuId(null); }}>
                  Confirmar
                </AppointmentMenuItem>
              )}
              {!isProfessionalRole && !["cancelled", "completed"].includes(appointment.status) && (
                <AppointmentMenuItem icon={<UserCheck size={16} />} onClick={() => { onComplete(); setOpenMenuId(null); }}>
                  Marcar atendido
                </AppointmentMenuItem>
              )}
              {!isProfessionalRole && (
                <AppointmentMenuItem icon={<CreditCard size={16} />} onClick={() => { onRegisterPayment(); setOpenMenuId(null); }}>
                  Registrar pago
                </AppointmentMenuItem>
              )}
              <AppointmentMenuItem icon={<CreditCard size={16} />} onClick={() => { onGeneratePaymentLink(); setOpenMenuId(null); }}>
                Generar link de pago
              </AppointmentMenuItem>
              {paymentLinks[appointment.id] && (
                <AppointmentMenuItem icon={<Copy size={16} />} onClick={() => { onCopyLink(); setOpenMenuId(null); }}>
                  Copiar link
                </AppointmentMenuItem>
              )}
              <AppointmentMenuItem icon={<Copy size={16} />} disabled={!appointment.patient?.phone} onClick={() => { onCopyMessage(); setOpenMenuId(null); }}>
                Copiar mensaje
              </AppointmentMenuItem>
              {!isProfessionalRole && !["cancelled", "completed"].includes(appointment.status) && (
                <>
                  <AppointmentMenuItem onClick={() => { onNoShow(); setOpenMenuId(null); }}>
                    Marcar no asistió
                  </AppointmentMenuItem>
                  <AppointmentMenuItem tone="danger" onClick={() => { onCancel(); setOpenMenuId(null); }}>
                    Cancelar
                  </AppointmentMenuItem>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function HuecoCard({ hueco, onOcupar, disabled }: { hueco: HuecoSlot; onOcupar: () => void; disabled?: boolean }) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#8FD2C6] bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#E6F4F1] text-clinic-brand">
          <Clock3 size={16} />
        </span>
        <div>
          <p className="font-semibold text-clinic-ink">Hueco libre</p>
          <p className="text-xs text-clinic-muted">Disponible para ocupar</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-clinic-ink">
          Dr/a. {hueco.professional.name} {hueco.professional.last_name}
        </p>
        <p className="truncate text-xs text-clinic-muted">{hueco.professional.specialties?.[0]?.name ?? hueco.service.name}</p>
      </div>
      {!disabled && (
        <Button variant="primary" onClick={onOcupar}>Ocupar</Button>
      )}
    </article>
  );
}

function WeekView({
  dateFrom,
  dateTo,
  appointments,
  timezone,
  onSelectDay
}: {
  dateFrom: string;
  dateTo: string;
  appointments: AppointmentWithRelations[];
  timezone: string;
  onSelectDay: (date: string) => void;
}) {
  const days: string[] = [];
  let cursor = dateFrom;
  while (cursor <= dateTo) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return (
    <div className="divide-y divide-clinic-line">
      {days.map((day) => {
        const dayAppointments = appointments
          .filter((appointment) => getDateInTimeZone(new Date(appointment.starts_at), timezone) === day)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return (
          <div key={day} className="px-5 py-4">
            <button type="button" onClick={() => onSelectDay(day)} className="flex items-baseline gap-2">
              <span className="font-semibold capitalize text-clinic-ink">{formatShortDateLabel(day)}</span>
              {day === today && <span className="rounded-md bg-[#E6F4F1] px-2 py-0.5 text-xs font-semibold text-clinic-brand">Hoy</span>}
            </button>
            <div className="mt-2 grid gap-2">
              {dayAppointments.length === 0 ? (
                <p className="text-sm text-clinic-muted">Sin turnos.</p>
              ) : (
                dayAppointments.map((appointment) => (
                  <div key={appointment.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-clinic-line px-3 py-2 text-sm">
                    <span className="font-semibold text-clinic-brand">{formatTime(appointment.starts_at, timezone)}</span>
                    <span className="font-medium text-clinic-ink">
                      {appointment.patient ? `${appointment.patient.first_name} ${appointment.patient.last_name}` : "Paciente sin vincular"}
                    </span>
                    <span className="text-clinic-muted">{appointment.service?.name ?? appointment.reason}</span>
                    <AppointmentStatusBadge status={appointment.status} />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  month,
  selectedDate,
  activity,
  onSelectDay
}: {
  month: string;
  selectedDate: string;
  activity: Record<string, number>;
  onSelectDay: (date: string) => void;
}) {
  const cells = buildMonthCells(month);
  return (
    <div className="p-5">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-clinic-muted">
        {["L", "M", "M", "J", "V", "S", "D"].map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} />;
          const count = activity[cell] ?? 0;
          const isSelected = cell === selectedDate;
          const isToday = cell === today;
          return (
            <button
              key={cell}
              type="button"
              onClick={() => onSelectDay(cell)}
              className={`flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm transition ${
                isSelected ? "border-clinic-brand bg-clinic-brand text-white" : isToday ? "border-[#8FD2C6] bg-[#F3FAF9] text-clinic-ink" : "border-transparent text-clinic-ink hover:border-clinic-line"
              }`}
            >
              <span className="font-semibold">{Number(cell.slice(-2))}</span>
              {count > 0 && <span className={`text-[10px] ${isSelected ? "text-white" : "text-clinic-brand"}`}>{count} turno{count > 1 ? "s" : ""}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniCalendar({
  month,
  selectedDate,
  activity,
  onMonthChange,
  onSelectDate
}: {
  month: string;
  selectedDate: string;
  activity: Record<string, number>;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
}) {
  const cells = buildMonthCells(month);
  const [year, monthNum] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNum - 1, 1)));

  function shiftMonth(delta: number) {
    const date = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
    onMonthChange(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize text-clinic-ink">{label}</p>
        <div className="flex items-center gap-1">
          <IconButton label="Mes anterior" onClick={() => shiftMonth(-1)}><ChevronLeft size={15} /></IconButton>
          <IconButton label="Mes siguiente" onClick={() => shiftMonth(1)}><ChevronRight size={15} /></IconButton>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-clinic-muted">
        {["L", "M", "M", "J", "V", "S", "D"].map((label2, index) => (
          <span key={`${label2}-${index}`}>{label2}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${index}`} />;
          const hasActivity = (activity[cell] ?? 0) > 0;
          const isSelected = cell === selectedDate;
          const isToday = cell === today;
          return (
            <button
              key={cell}
              type="button"
              onClick={() => onSelectDate(cell)}
              className={`grid h-8 place-items-center rounded-full text-xs font-medium transition ${
                isSelected ? "bg-clinic-brand text-white" : isToday ? "border border-[#8FD2C6] text-clinic-ink" : "text-clinic-ink hover:bg-[#E6F4F1]"
              }`}
            >
              <span className="relative">
                {Number(cell.slice(-2))}
                {hasActivity && !isSelected && <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#8FD2C6]" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildMonthCells(month: string): Array<string | null> {
  const [year, monthNum] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNum - 1, 1));
  const firstWeekday = firstDay.getUTCDay() === 0 ? 7 : firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: firstWeekday - 1 }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  return cells;
}

function mondayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return addDays(date, weekDay === 0 ? -6 : 1 - weekDay);
}

function endOfMonthOf(firstDayOfMonth: string) {
  const [year, month] = firstDayOfMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
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

function KpiChip({ icon, value, label, tone }: { icon: ReactNode; value: number | string; label: string; tone: "amber" | "mint" | "red" }) {
  const toneClass =
    tone === "amber" ? "bg-amber-50 text-amber-700" : tone === "red" ? "bg-red-50 text-red-600" : "bg-[#E6F4F1] text-clinic-brand";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-clinic-line bg-white px-4 py-3">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none text-clinic-ink">{value}</p>
        <p className="truncate text-xs text-clinic-muted">{label}</p>
      </div>
    </div>
  );
}

function IconButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-transparent text-clinic-muted transition hover:border-clinic-line hover:bg-[#E6F4F1] hover:text-clinic-ink"
    >
      {children}
    </button>
  );
}

function EmptyState({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="font-semibold text-clinic-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-clinic-muted">{description}</p>
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
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

function formatDateNoWeekday(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatMonthLabel(date: string) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
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

function minutesUntilLabel(startsAt: string) {
  const diffMs = new Date(startsAt).getTime() - Date.now();
  if (diffMs <= 0) return "Ahora";
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 60) return `En ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `En ${hours} h`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function AppointmentMenuItem({
  children,
  icon,
  onClick,
  disabled,
  tone = "default"
}: {
  children: ReactNode;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-clinic-ink hover:bg-[#e6f4f1]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Message({ tone, children }: { tone: "success" | "error"; children: string }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-red-200 bg-red-50 text-red-700";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}
