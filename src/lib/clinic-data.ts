import { supabase } from "./supabase";
import {
  availabilityRules as fallbackAvailabilityRules,
  professionals as fallbackProfessionals,
  services as fallbackServices
} from "../data/clinicMockData";
import {
  AvailabilityBlock,
  AvailabilityBlockInput,
  AvailabilityRule,
  AvailabilityRuleInput,
  AvailabilityRuleWithRelations,
  Appointment,
  AppointmentFilters,
  AppointmentInput,
  OverbookingInput,
  AppointmentStatus,
  AppointmentWithRelations,
  AvailableSlot,
  Clinic,
  ClinicDataResult,
  ClinicHours,
  ClinicInput,
  ClinicMemberWithProfile,
  Location,
  LocationInput,
  MessageLog,
  MessageTemplate,
  Patient,
  PatientInput,
  PatientWithAppointments,
  PaymentFilters,
  PaymentEvent,
  PaymentSettings,
  PaymentWithRelations,
  ClinicalEvolutionWithProfessional,
  ClinicalEvolutionDraftInput,
  ClinicalEvolutionDraftUpdate,
  Professional,
  ProfessionalInput,
  ProfessionalWithRelations,
  PublicBookingPayload,
  PublicBookingResult,
  Service,
  ServiceInput,
  ServiceWithRelations,
  Specialty,
  UserInvitation
} from "../types/clinic";

const DEFAULT_CLINIC_SLUG = "clinica-central";

export class FriendlyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendlyDataError";
  }
}

export async function getDefaultClinic() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data: member, error: memberError } = await supabase
        .from("clinic_members")
        .select("clinic_id")
        .eq("user_id", auth.user.id)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (memberError) throw memberError;
      if (member?.clinic_id) {
        const { data: clinic, error } = await supabase
          .from("clinics")
          .select("*")
          .eq("id", member.clinic_id)
          .maybeSingle();
        if (error) throw error;
        if (clinic) return clinic as Clinic;
      }
    }
  } catch (error) {
    console.error("Failed to resolve member clinic", error);
  }
  return getClinicBySlug(DEFAULT_CLINIC_SLUG);
}

export async function getClinicBySlug(slug: string): Promise<Clinic | null> {
  try {
    const { data, error } = await supabase.from("clinics").select("*").eq("slug", slug).maybeSingle();
    if (error) throw error;
    return data as Clinic | null;
  } catch (error) {
    console.error("Failed to load clinic", error);
    throw new FriendlyDataError("No pudimos cargar la configuracion de la clinica.");
  }
}

export async function updateClinic(id: string, data: ClinicInput): Promise<Clinic> {
  try {
    const { data: updated, error } = await supabase
      .from("clinics")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return updated as Clinic;
  } catch (error) {
    console.error("Failed to update clinic", error);
    throw new FriendlyDataError("No pudimos actualizar los datos de la clinica.");
  }
}

export async function getLocations(clinicId: string): Promise<Location[]> {
  try {
    const { data, error } = await supabase
      .from("locations")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Location[];
  } catch (error) {
    console.error("Failed to load locations", error);
    throw new FriendlyDataError("No pudimos cargar las sedes.");
  }
}

export async function createLocation(data: LocationInput): Promise<Location> {
  try {
    const { data: created, error } = await supabase.from("locations").insert(data).select("*").single();
    if (error) throw error;
    return created as Location;
  } catch (error) {
    console.error("Failed to create location", error);
    throw new FriendlyDataError("No pudimos crear la sede.");
  }
}

export async function updateLocation(id: string, data: Partial<LocationInput>): Promise<Location> {
  try {
    const { data: updated, error } = await supabase
      .from("locations")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return updated as Location;
  } catch (error) {
    console.error("Failed to update location", error);
    throw new FriendlyDataError("No pudimos actualizar la sede.");
  }
}

export async function getClinicHours(clinicId: string): Promise<ClinicHours[]> {
  try {
    const { data, error } = await supabase
      .from("clinic_hours")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("day_of_week");
    if (error) throw error;
    return (data ?? []) as ClinicHours[];
  } catch (error) {
    console.error("Failed to load clinic hours", error);
    throw new FriendlyDataError("No pudimos cargar los horarios generales.");
  }
}

export async function upsertClinicHour(hour: Partial<ClinicHours> & { clinic_id: string; day_of_week: number }) {
  try {
    const { data, error } = await supabase
      .from("clinic_hours")
      .upsert({ ...hour, updated_at: new Date().toISOString() }, { onConflict: "clinic_id,day_of_week" })
      .select("*")
      .single();
    if (error) throw error;
    return data as ClinicHours;
  } catch (error) {
    console.error("Failed to save clinic hour", error);
    throw new FriendlyDataError("No pudimos guardar el horario general.");
  }
}

export async function getClinicMembers(clinicId: string): Promise<ClinicMemberWithProfile[]> {
  try {
    const { data: members, error } = await supabase
      .from("clinic_members")
      .select("*, professionals(*), locations(*)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const userIds = (members ?? []).map((member: any) => member.user_id).filter(Boolean);
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase.from("profiles").select("id, full_name, phone, role").in("id", userIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    const profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    return (members ?? []).map((member: any) => ({
      ...member,
      profiles: profilesById.get(member.user_id) ?? null
    })) as ClinicMemberWithProfile[];
  } catch (error) {
    console.error("Failed to load clinic members", error);
    throw new FriendlyDataError("No pudimos cargar los usuarios.");
  }
}

export async function updateClinicMember(
  id: string,
  data: Partial<Pick<ClinicMemberWithProfile, "role" | "active" | "location_id" | "professional_id" | "invitation_status">>
) {
  try {
    const { data: updated, error } = await supabase
      .from("clinic_members")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return updated as ClinicMemberWithProfile;
  } catch (error) {
    console.error("Failed to update clinic member", error);
    throw new FriendlyDataError("No pudimos actualizar el usuario.");
  }
}

export async function getUserInvitations(clinicId: string): Promise<UserInvitation[]> {
  try {
    const { data, error } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as UserInvitation[];
  } catch (error) {
    console.error("Failed to load invitations", error);
    throw new FriendlyDataError("No pudimos cargar las invitaciones.");
  }
}

export async function getMessageTemplates(clinicId: string): Promise<MessageTemplate[]> {
  try {
    const { data, error } = await supabase
      .from("message_templates")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("name");
    if (error) throw error;
    return (data ?? []) as MessageTemplate[];
  } catch (error) {
    console.error("Failed to load message templates", error);
    throw new FriendlyDataError("No pudimos cargar las plantillas.");
  }
}

export async function getMessageLogs(clinicId: string): Promise<MessageLog[]> {
  try {
    const { data, error } = await supabase
      .from("message_logs")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data ?? []) as MessageLog[];
  } catch (error) {
    console.error("Failed to load message logs", error);
    throw new FriendlyDataError("No pudimos cargar los envios.");
  }
}

export async function getPayments(clinicId: string, filters: PaymentFilters = {}): Promise<PaymentWithRelations[]> {
  try {
    let query = supabase
      .from("payments")
      .select("*, clinics(*), patients(*), appointments(*), services(*)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });
    if (filters.dateFrom) {
      query = query.gte("created_at", zonedDateTimeToUtcIso(filters.dateFrom, "00:00", filters.timezone ?? "America/Argentina/Mendoza"));
    }
    if (filters.dateTo) {
      query = query.lt("created_at", zonedDateTimeToUtcIso(addDaysToDateString(filters.dateTo, 1), "00:00", filters.timezone ?? "America/Argentina/Mendoza"));
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PaymentWithRelations[];
  } catch (error) {
    console.error("Failed to load payments", error);
    throw new FriendlyDataError("No pudimos cargar los pagos.");
  }
}

export async function getPaymentById(id: string, clinicId?: string): Promise<PaymentWithRelations | null> {
  try {
    let query = supabase
      .from("payments")
      .select("*, clinics(*), patients(*), appointments(*), services(*)")
      .eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data as PaymentWithRelations | null;
  } catch (error) {
    console.error("Failed to load payment", error);
    throw new FriendlyDataError("No pudimos cargar el pago.");
  }
}

export async function getPaymentEvents(paymentId: string, clinicId?: string): Promise<PaymentEvent[]> {
  try {
    let query = supabase
      .from("payment_events")
      .select("*")
      .eq("payment_id", paymentId);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as PaymentEvent[];
  } catch (error) {
    console.error("Failed to load payment events", error);
    throw new FriendlyDataError("No pudimos cargar los eventos del pago.");
  }
}

export async function getPaymentSettings(clinicId: string): Promise<PaymentSettings | null> {
  try {
    const { data, error } = await supabase
      .from("payment_settings")
      .select("*")
      .eq("clinic_id", clinicId)
      .eq("provider", "mercado_pago")
      .maybeSingle();
    if (error) throw error;
    return data as PaymentSettings | null;
  } catch (error) {
    console.error("Failed to load payment settings", error);
    throw new FriendlyDataError("No pudimos cargar la configuracion de pagos.");
  }
}

export async function updatePaymentSettings(id: string, data: Partial<PaymentSettings>, clinicId?: string): Promise<PaymentSettings> {
  try {
    let query = supabase
      .from("payment_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data: updated, error } = await query.select("*").single();
    if (error) throw error;
    return updated as PaymentSettings;
  } catch (error) {
    console.error("Failed to update payment settings", error);
    throw new FriendlyDataError("No pudimos guardar la configuracion de pagos.");
  }
}

export async function getSpecialties(clinicId: string): Promise<Specialty[]> {
  try {
    const { data, error } = await supabase
      .from("specialties")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("name");
    if (error) throw error;
    return (data ?? []) as Specialty[];
  } catch (error) {
    console.error("Failed to load specialties", error);
    throw new FriendlyDataError("No pudimos cargar las especialidades.");
  }
}

export async function getProfessionals(clinicId: string): Promise<ClinicDataResult<ProfessionalWithRelations[]>> {
  try {
    const { data, error } = await supabase
      .from("professionals")
      .select(
        `
        *,
        professional_specialties(specialties(*)),
        professional_services(services(*))
      `
      )
      .eq("clinic_id", clinicId)
      .order("last_name");
    if (error) throw error;
    const professionals = (data ?? []).map(mapProfessional);
    return professionals.length > 0
      ? { data: professionals, fromFallback: false }
      : { data: fallbackProfessionals.map(mapFallbackProfessional), fromFallback: true };
  } catch (error) {
    console.error("Failed to load professionals", error);
    return { data: fallbackProfessionals.map(mapFallbackProfessional), fromFallback: true };
  }
}

export async function getProfessionalById(idOrSlug: string, clinicId?: string): Promise<ProfessionalWithRelations | null> {
  try {
    let query = supabase
      .from("professionals")
      .select(
        `
        *,
        professional_specialties(specialties(*)),
        professional_services(services(*)),
        availability_rules(*)
      `
      );
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data, error } = isUuid(idOrSlug)
      ? await query.eq("id", idOrSlug).maybeSingle()
      : await query.eq("slug", idOrSlug).maybeSingle();
    if (error) throw error;
    return data ? mapProfessional(data) : clinicId ? null : mapFallbackProfessionalById(idOrSlug);
  } catch (error) {
    console.error("Failed to load professional", error);
    return clinicId ? null : mapFallbackProfessionalById(idOrSlug);
  }
}

export async function createProfessional(data: ProfessionalInput): Promise<Professional> {
  try {
    const { data: created, error } = await supabase
      .from("professionals")
      .insert({ ...data, slug: data.slug ?? slugify(`${data.name}-${data.last_name}`) })
      .select("*")
      .single();
    if (error) throw error;
    return created as Professional;
  } catch (error) {
    console.error("Failed to create professional", error);
    throw new FriendlyDataError("No pudimos crear el profesional. Intenta nuevamente.");
  }
}

export async function updateProfessional(id: string, data: Partial<ProfessionalInput>, clinicId?: string): Promise<Professional> {
  try {
    let query = supabase
      .from("professionals")
      .update(data)
      .eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data: updated, error } = await query.select("*").single();
    if (error) throw error;
    return updated as Professional;
  } catch (error) {
    console.error("Failed to update professional", error);
    throw new FriendlyDataError("No pudimos actualizar el profesional.");
  }
}

export async function toggleProfessionalStatus(id: string, active: boolean): Promise<void> {
  await updateProfessional(id, { active });
}

export async function getServices(clinicId: string): Promise<ClinicDataResult<ServiceWithRelations[]>> {
  try {
    const { data, error } = await supabase
      .from("services")
      .select(
        `
        *,
        specialties(*),
        professional_services(professionals(*))
      `
      )
      .eq("clinic_id", clinicId)
      .order("name");
    if (error) throw error;
    const services = (data ?? []).map(mapService);
    return services.length > 0
      ? { data: services, fromFallback: false }
      : { data: fallbackServices.map(mapFallbackService), fromFallback: true };
  } catch (error) {
    console.error("Failed to load services", error);
    return { data: fallbackServices.map(mapFallbackService), fromFallback: true };
  }
}

export async function createService(data: ServiceInput): Promise<Service> {
  try {
    const { data: created, error } = await supabase
      .from("services")
      .insert({ ...data, slug: data.slug ?? slugify(data.name) })
      .select("*")
      .single();
    if (error) throw error;
    return created as Service;
  } catch (error) {
    console.error("Failed to create service", error);
    throw new FriendlyDataError("No pudimos crear el servicio.");
  }
}

export async function updateService(id: string, data: Partial<ServiceInput>, clinicId?: string): Promise<Service> {
  try {
    let query = supabase
      .from("services")
      .update(data)
      .eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data: updated, error } = await query.select("*").single();
    if (error) throw error;
    return updated as Service;
  } catch (error) {
    console.error("Failed to update service", error);
    throw new FriendlyDataError("No pudimos actualizar el servicio.");
  }
}

export async function toggleServiceStatus(id: string, active: boolean): Promise<void> {
  await updateService(id, { active });
}

export async function getAvailabilityRules(
  clinicId: string,
  professionalId?: string
): Promise<ClinicDataResult<AvailabilityRuleWithRelations[]>> {
  try {
    let query = supabase
      .from("availability_rules")
      .select("*, professionals(*), locations(*)")
      .eq("clinic_id", clinicId)
      .order("day_of_week")
      .order("start_time");
    if (professionalId) query = query.eq("professional_id", professionalId);
    const { data, error } = await query;
    if (error) throw error;
    const rules = (data ?? []).map(mapAvailabilityRule);
    return rules.length > 0
      ? { data: rules, fromFallback: false }
      : { data: fallbackAvailabilityRules.map(mapFallbackAvailabilityRule), fromFallback: true };
  } catch (error) {
    console.error("Failed to load availability rules", error);
    return { data: fallbackAvailabilityRules.map(mapFallbackAvailabilityRule), fromFallback: true };
  }
}

export async function createAvailabilityRule(data: AvailabilityRuleInput): Promise<AvailabilityRule> {
  try {
    const { data: created, error } = await supabase
      .from("availability_rules")
      .insert(data)
      .select("*")
      .single();
    if (error) throw error;
    return created as AvailabilityRule;
  } catch (error) {
    console.error("Failed to create availability rule", error);
    throw new FriendlyDataError("No pudimos crear el horario.");
  }
}

export async function updateAvailabilityRule(
  id: string,
  data: Partial<AvailabilityRuleInput>
): Promise<AvailabilityRule> {
  try {
    const { data: updated, error } = await supabase
      .from("availability_rules")
      .update(data)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return updated as AvailabilityRule;
  } catch (error) {
    console.error("Failed to update availability rule", error);
    throw new FriendlyDataError("No pudimos actualizar el horario.");
  }
}

export async function deleteAvailabilityRule(id: string, clinicId?: string): Promise<void> {
  try {
    let query = supabase.from("availability_rules").delete().eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { error } = await query;
    if (error) throw error;
  } catch (error) {
    console.error("Failed to delete availability rule", error);
    throw new FriendlyDataError("No pudimos eliminar el horario.");
  }
}

export async function getAvailabilityBlocks(clinicId: string, professionalId?: string): Promise<AvailabilityBlock[]> {
  try {
    let query = supabase
      .from("availability_blocks")
      .select("*")
      .eq("clinic_id", clinicId)
      .order("date");
    if (professionalId) query = query.eq("professional_id", professionalId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as AvailabilityBlock[];
  } catch (error) {
    console.error("Failed to load availability blocks", error);
    throw new FriendlyDataError("No pudimos cargar los bloqueos.");
  }
}

export async function createAvailabilityBlock(data: AvailabilityBlockInput): Promise<AvailabilityBlock> {
  try {
    const { data: created, error } = await supabase
      .from("availability_blocks")
      .insert(data)
      .select("*")
      .single();
    if (error) throw error;
    return created as AvailabilityBlock;
  } catch (error) {
    console.error("Failed to create availability block", error);
    throw new FriendlyDataError("No pudimos crear el bloqueo.");
  }
}

export async function deleteAvailabilityBlock(id: string, clinicId?: string): Promise<void> {
  try {
    let query = supabase.from("availability_blocks").delete().eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { error } = await query;
    if (error) throw error;
  } catch (error) {
    console.error("Failed to delete availability block", error);
    throw new FriendlyDataError("No pudimos eliminar el bloqueo.");
  }
}

export async function getPatients(clinicId: string): Promise<PatientWithAppointments[]> {
  try {
    const { data, error } = await supabase
      .from("patients")
      .select("*, appointments(*)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPatient);
  } catch (error) {
    console.error("Failed to load patients", error);
    throw new FriendlyDataError("No pudimos cargar los pacientes.");
  }
}

export async function searchPatients(clinicId: string, query: string): Promise<PatientWithAppointments[]> {
  const normalized = query.trim();
  if (!normalized) return getPatients(clinicId);
  try {
    const { data, error } = await supabase
      .from("patients")
      .select("*, appointments(*)")
      .eq("clinic_id", clinicId)
      .or(
        `first_name.ilike.%${normalized}%,last_name.ilike.%${normalized}%,phone.ilike.%${normalized}%,email.ilike.%${normalized}%,document_number.ilike.%${normalized}%`
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPatient);
  } catch (error) {
    console.error("Failed to search patients", error);
    throw new FriendlyDataError("No pudimos buscar pacientes.");
  }
}

export async function getPatientById(id: string, clinicId?: string): Promise<PatientWithAppointments | null> {
  try {
    let query = supabase
      .from("patients")
      .select("*, appointments(*)")
      .eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data ? mapPatient(data) : null;
  } catch (error) {
    console.error("Failed to load patient", error);
    throw new FriendlyDataError("No pudimos cargar el paciente.");
  }
}

export async function createPatient(data: PatientInput): Promise<Patient> {
  try {
    const { data: created, error } = await supabase.from("patients").insert(data).select("*").single();
    if (error) throw error;
    return created as Patient;
  } catch (error) {
    console.error("Failed to create patient", error);
    throw new FriendlyDataError("No pudimos crear el paciente.");
  }
}

export async function updatePatient(id: string, data: Partial<PatientInput>, clinicId?: string): Promise<Patient> {
  try {
    let query = supabase
      .from("patients")
      .update(data)
      .eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data: updated, error } = await query.select("*").single();
    if (error) throw error;
    return updated as Patient;
  } catch (error) {
    console.error("Failed to update patient", error);
    throw new FriendlyDataError("No pudimos actualizar el paciente.");
  }
}

export async function getAppointments(
  clinicId: string,
  filters: AppointmentFilters = {}
): Promise<AppointmentWithRelations[]> {
  try {
    let query = supabase
      .from("appointments")
      .select("*, patients(*), professionals(*), services(*), locations(*), appointment_public_links(token, expires_at, revoked_at)")
      .eq("clinic_id", clinicId)
      .order("starts_at");
    if (filters.date || filters.dateFrom || filters.dateTo) {
      const timezone = filters.timezone ?? "America/Argentina/Mendoza";
      const dateFrom = filters.dateFrom ?? filters.date as string;
      const dateTo = filters.dateTo ?? filters.date as string;
      const start = zonedDateTimeToUtcIso(dateFrom, "00:00", timezone);
      const end = zonedDateTimeToUtcIso(addDaysToDateString(dateTo, 1), "00:00", timezone);
      query = query.gte("starts_at", start).lt("starts_at", end);
    }
    if (filters.professionalId && filters.professionalId !== "all") {
      query = query.eq("professional_id", filters.professionalId);
    }
    if (filters.serviceId && filters.serviceId !== "all") query = query.eq("service_id", filters.serviceId);
    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapAppointment);
  } catch (error) {
    console.error("Failed to load appointments", error);
    throw new FriendlyDataError("No pudimos cargar la agenda.");
  }
}

export async function createAppointment(data: AppointmentInput): Promise<Appointment> {
  try {
    await assertSlotAvailable(data.clinic_id, data.professional_id, data.service_id, data.starts_at, data.location_id);
    const { data: created, error } = await supabase
      .from("appointments")
      .insert({
        ...data,
        appointment_type: data.appointment_type ?? "in_person",
        status: data.status ?? "confirmed",
        source: data.source ?? "manual",
        whatsapp_status: data.whatsapp_status ?? "pending"
      })
      .select("*")
      .single();
    if (error) throw error;
    await logAppointmentEvent(created.id, "appointment_created", null, created.status);
    return created as Appointment;
  } catch (error) {
    if (error instanceof FriendlyDataError) throw error;
    console.error("Failed to create appointment", error);
    throw new FriendlyDataError("No pudimos crear el turno.");
  }
}

export async function createOverbooking(data: OverbookingInput): Promise<Appointment> {
  try {
    if (!data.overbooking_reason.trim()) throw new FriendlyDataError("Indica el motivo del sobreturno.");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new FriendlyDataError("Tu sesión expiró. Volvé a ingresar.");
    const { data: created, error } = await supabase
      .from("appointments")
      .insert({
        ...data,
        appointment_type: data.appointment_type ?? "in_person",
        status: data.status ?? "confirmed",
        source: "manual",
        whatsapp_status: data.whatsapp_status ?? "pending",
        is_overbooking: true,
        overbooking_created_by: auth.user.id,
        overbooking_created_at: new Date().toISOString()
      })
      .select("*")
      .single();
    if (error) throw error;
    await logAppointmentEvent(created.id, "overbooking_created", null, created.status, {
      reason: data.overbooking_reason,
      authorized_by: data.overbooking_authorized_by ?? null,
      conflict_appointment_id: data.overbooking_conflict_appointment_id ?? null
    });
    const { error: auditError } = await supabase.from("audit_logs").insert({
      clinic_id: data.clinic_id,
      user_id: auth.user.id,
      action: "overbooking_created",
      entity_type: "appointment",
      entity_id: created.id,
      metadata: {
        appointment_id: created.id,
        clinic_id: data.clinic_id,
        professional_id: data.professional_id,
        patient_id: data.patient_id,
        starts_at: data.starts_at,
        reason: data.overbooking_reason,
        authorized_by: data.overbooking_authorized_by ?? null
      }
    });
    if (auditError) console.error("Failed to audit overbooking", auditError);
    if (created.status === "confirmed") {
      await logAppointmentEvent(created.id, "overbooking_confirmed", null, created.status, { reason: data.overbooking_reason });
      await supabase.from("audit_logs").insert({
        clinic_id: data.clinic_id,
        user_id: auth.user.id,
        action: "overbooking_confirmed",
        entity_type: "appointment",
        entity_id: created.id,
        metadata: { appointment_id: created.id, professional_id: data.professional_id, patient_id: data.patient_id, starts_at: data.starts_at, reason: data.overbooking_reason, authorized_by: data.overbooking_authorized_by ?? null }
      });
    }
    return created as Appointment;
  } catch (error) {
    if (error instanceof FriendlyDataError) throw error;
    console.error("Failed to create overbooking", error);
    throw new FriendlyDataError("No pudimos crear el sobreturno.");
  }
}

export async function updateAppointment(id: string, data: Partial<AppointmentInput>, clinicId?: string): Promise<Appointment> {
  try {
    let query = supabase
      .from("appointments")
      .update(data)
      .eq("id", id);
    if (clinicId) query = query.eq("clinic_id", clinicId);
    const { data: updated, error } = await query.select("*").single();
    if (error) throw error;
    return updated as Appointment;
  } catch (error) {
    console.error("Failed to update appointment", error);
    throw new FriendlyDataError("No pudimos actualizar el turno.");
  }
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  metadata: Record<string, unknown> = {},
  clinicId?: string
): Promise<void> {
  try {
    let readQuery = supabase
      .from("appointments")
      .select("status")
      .eq("id", id);
    if (clinicId) readQuery = readQuery.eq("clinic_id", clinicId);
    const { data: current, error: readError } = await readQuery.single();
    if (readError) throw readError;
    let updateQuery = supabase.from("appointments").update({ status }).eq("id", id);
    if (clinicId) updateQuery = updateQuery.eq("clinic_id", clinicId);
    const { error } = await updateQuery;
    if (error) throw error;
    const eventByStatus: Record<string, string> = {
      confirmed: "appointment_confirmed",
      cancelled: "appointment_cancelled",
      completed: "appointment_completed",
      no_show: "appointment_no_show",
      rescheduled: "appointment_rescheduled",
      urgent: "appointment_marked_urgent"
    };
    const eventType = eventByStatus[status] ?? "appointment_status_changed";
    await logAppointmentEvent(id, eventType, current.status, status, metadata);
    const { data: overbooking } = await supabase.from("appointments").select("is_overbooking, clinic_id, professional_id, patient_id, starts_at, overbooking_reason, overbooking_authorized_by").eq("id", id).maybeSingle();
    if (overbooking?.is_overbooking) {
      const action = status === "cancelled" ? "overbooking_cancelled" : status === "confirmed" ? "overbooking_confirmed" : "overbooking_updated";
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert({ clinic_id: overbooking.clinic_id, user_id: auth.user?.id ?? null, action, entity_type: "appointment", entity_id: id, metadata: { appointment_id: id, professional_id: overbooking.professional_id, patient_id: overbooking.patient_id, starts_at: overbooking.starts_at, reason: overbooking.overbooking_reason, authorized_by: overbooking.overbooking_authorized_by } });
    }
  } catch (error) {
    console.error("Failed to update appointment status", error);
    throw new FriendlyDataError("No pudimos actualizar el estado del turno.");
  }
}

export async function confirmAppointment(id: string, clinicId?: string) {
  return updateAppointmentStatus(id, "confirmed", {}, clinicId);
}

export async function cancelAppointment(id: string, reason?: string, clinicId?: string) {
  await updateAppointment(id, { cancellation_reason: reason ?? null } as Partial<AppointmentInput>, clinicId);
  return updateAppointmentStatus(id, "cancelled", { reason }, clinicId);
}

export async function markAppointmentCompleted(id: string, clinicId?: string) {
  return updateAppointmentStatus(id, "completed", {}, clinicId);
}

export async function markAppointmentNoShow(id: string, clinicId?: string) {
  return updateAppointmentStatus(id, "no_show", {}, clinicId);
}

export async function rescheduleAppointment(id: string, newStartTime: string, newEndTime: string, clinicId?: string) {
  const { data: current, error } = await supabase
    .from("appointments")
    .select("clinic_id, professional_id, service_id")
    .eq("id", id)
    .single();
  if (error) {
    console.error("Failed to read appointment before reschedule", error);
    throw new FriendlyDataError("No pudimos reprogramar el turno.");
  }
  if (clinicId && current.clinic_id !== clinicId) {
    throw new FriendlyDataError("Este turno pertenece a otra clinica.");
  }
  if (!current.clinic_id || !current.professional_id || !current.service_id) {
    throw new FriendlyDataError("El turno no tiene profesional o servicio asignado.");
  }
  await assertSlotAvailable(current.clinic_id, current.professional_id, current.service_id, newStartTime);
  const updated = await updateAppointment(id, {
    starts_at: newStartTime,
    end_time: newEndTime,
    status: "rescheduled"
  } as Partial<AppointmentInput>, clinicId);
  await logAppointmentEvent(id, "appointment_rescheduled", null, "rescheduled", {
    starts_at: newStartTime,
    end_time: newEndTime
  });
  return updated;
}

export async function getAvailableSlots({
  clinicId,
  professionalId,
  serviceId,
  locationId,
  date,
  timezone = "America/Argentina/Mendoza"
}: {
  clinicId: string;
  professionalId: string;
  serviceId: string;
  locationId?: string | null;
  date: string;
  timezone?: string;
}): Promise<AvailableSlot[]> {
  const [rulesResult, blocks, serviceResult, appointments] = await Promise.all([
    getAvailabilityRules(clinicId, professionalId),
    getAvailabilityBlocks(clinicId, professionalId),
    getServices(clinicId),
    getAppointments(clinicId, { date, timezone })
  ]);
  const service = serviceResult.data.find((item) => item.id === serviceId);
  if (!service || !service.active) return [];
  const duration = service?.duration_minutes ?? 30;
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const rules = rulesResult.data.filter((rule) =>
    rule.day_of_week === dayOfWeek &&
    rule.active &&
    (!locationId || !rule.location_id || rule.location_id === locationId)
  );
  const dayBlocks = blocks.filter((block) => block.date === date);
  const busyAppointments = appointments.filter(
    (appointment) =>
      appointment.professional_id === professionalId &&
      ["pending", "confirmed", "urgent", "rescheduled"].includes(appointment.status)
  );

  return rules.flatMap((rule) => {
    const slots: AvailableSlot[] = [];
    let cursor = timeToMinutes(rule.start_time);
    const end = timeToMinutes(rule.end_time);
    while (cursor + duration <= end) {
      const slot = minutesToTime(cursor);
      const startsAt = zonedDateTimeToUtcIso(date, slot, timezone);
      const endTime = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
      const blocked = dayBlocks.some(
        (block) => cursor < timeToMinutes(block.end_time) && cursor + duration > timeToMinutes(block.start_time)
      );
      const occupied = busyAppointments.some((appointment) =>
        rangesOverlap(
          startsAt,
          endTime,
          appointment.starts_at,
          appointment.end_time ?? new Date(new Date(appointment.starts_at).getTime() + duration * 60000).toISOString()
        )
      );
      const isPastToday =
        date === getDateInTimeZone(new Date(), timezone) &&
        cursor <= getMinutesInTimeZone(new Date(), timezone);
      if (!blocked && !occupied && !isPastToday) slots.push({ time: slot, startsAt, endTime });
      cursor += duration;
    }
    return slots;
  });
}

export async function createPublicBooking(payload: PublicBookingPayload): Promise<PublicBookingResult> {
  try {
    const { data, error } = await supabase.rpc("create_public_booking", {
      p_clinic_slug: payload.clinicSlug,
      p_professional_id: payload.professionalId,
      p_service_id: payload.serviceId,
      p_start_time: payload.startTime,
      p_first_name: payload.firstName,
      p_last_name: payload.lastName,
      p_phone: payload.phone,
      p_email: payload.email ?? null,
      p_document_number: payload.documentNumber ?? null,
      p_insurance: payload.insurance ?? null,
      p_coverage_id: payload.coverageId ?? null,
      p_custom_coverage_name: payload.customCoverageName ?? null,
      p_reason: payload.reason ?? null
    });
    if (error) throw error;
    return data as PublicBookingResult;
  } catch (error: any) {
    console.error("Failed to create public booking", error);
    if (String(error?.message ?? "").includes("SLOT_NOT_AVAILABLE")) {
      throw new FriendlyDataError("Ese horario ya no esta disponible. Elegi otro horario para continuar.");
    }
    throw new FriendlyDataError("No pudimos crear la reserva. Intenta nuevamente.");
  }
}

export async function getPublicAvailableSlots({
  clinicSlug,
  professionalId,
  serviceId,
  date
}: {
  clinicSlug: string;
  professionalId: string;
  serviceId: string;
  date: string;
}): Promise<AvailableSlot[]> {
  try {
    const { data, error } = await supabase.rpc("get_public_available_slots", {
      p_clinic_slug: clinicSlug,
      p_professional_id: professionalId,
      p_service_id: serviceId,
      p_date: date
    });
    if (error) throw error;
    return (data ?? []).map((slot: any) => ({
      time: slot.time,
      startsAt: slot.starts_at,
      endTime: slot.end_time
    }));
  } catch (error) {
    console.error("Failed to load public slots", error);
    throw new FriendlyDataError("No pudimos cargar los horarios disponibles.");
  }
}

async function assertSlotAvailable(clinicId: string, professionalId: string, serviceId: string, startsAt: string, locationId?: string | null) {
  const { data: clinic } = await supabase
    .from("clinics")
    .select("timezone")
    .eq("id", clinicId)
    .maybeSingle();
  const timezone = clinic?.timezone ?? "America/Argentina/Mendoza";
  const date = getDateInTimeZone(new Date(startsAt), timezone);
  const slots = await getAvailableSlots({ clinicId, professionalId, serviceId, locationId, date, timezone });
  if (!slots.some((slot) => slot.startsAt === startsAt)) {
    throw new FriendlyDataError("Ese horario ya no está disponible. Elegí otro horario o creá un sobreturno.");
  }
}

async function logAppointmentEvent(
  appointmentId: string,
  eventType: string,
  oldStatus: AppointmentStatus | null,
  newStatus: AppointmentStatus | null,
  metadata: Record<string, unknown> = {}
) {
  const { error } = await supabase.from("appointment_events").insert({
    appointment_id: appointmentId,
    event_type: eventType,
    old_status: oldStatus,
    new_status: newStatus,
    metadata
  });
  if (error) console.error("Failed to log appointment event", error);
}

// ---------------------------------------------------------------------------
// Registro clínico V1
// ---------------------------------------------------------------------------

export async function createClinicalEvolutionDraft(
  input: ClinicalEvolutionDraftInput
): Promise<ClinicalEvolutionWithProfessional> {
  try {
    const { data, error } = await supabase
      .from("clinical_evolutions")
      .insert({
        clinic_id: input.clinic_id,
        patient_id: input.patient_id,
        professional_id: input.professional_id,
        appointment_id: null,
        reason: input.reason,
        current_condition: input.current_condition,
        physical_exam: input.physical_exam,
        diagnosis: input.diagnosis,
        plan: input.plan,
        observations: input.observations,
        status: "draft"
      })
      .select("*, professionals(id, name, last_name)")
      .single();
    if (error) throw error;
    return { ...data, professional: (data as any).professionals ?? null } as ClinicalEvolutionWithProfessional;
  } catch (error) {
    console.error("Failed to create clinical evolution", error);
    if (error instanceof Error && error.message.includes("row-level security")) {
      throw new FriendlyDataError("No tenés permisos para modificar registros clínicos.");
    }
    throw new FriendlyDataError("No pudimos guardar el borrador. Intentá de nuevo.");
  }
}

export async function updateClinicalEvolutionDraft(
  id: string,
  clinicId: string,
  patientId: string,
  input: ClinicalEvolutionDraftUpdate
): Promise<ClinicalEvolutionWithProfessional> {
  try {
    const { data, error } = await supabase
      .from("clinical_evolutions")
      .update({
        reason: input.reason,
        current_condition: input.current_condition,
        physical_exam: input.physical_exam,
        diagnosis: input.diagnosis,
        plan: input.plan,
        observations: input.observations
      })
      .eq("id", id)
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .eq("status", "draft")
      .select("*, professionals(id, name, last_name)")
      .single();
    if (error) throw error;
    return { ...data, professional: (data as any).professionals ?? null } as ClinicalEvolutionWithProfessional;
  } catch (error) {
    console.error("Failed to update clinical evolution", error);
    if (error instanceof Error && error.message.includes("row-level security")) {
      throw new FriendlyDataError("No tenés permisos para modificar registros clínicos.");
    }
    throw new FriendlyDataError("No pudimos actualizar el borrador. Intentá de nuevo.");
  }
}

export async function getClinicalEvolutionsByPatient(
  clinicId: string,
  patientId: string
): Promise<ClinicalEvolutionWithProfessional[]> {
  try {
    const { data, error } = await supabase
      .from("clinical_evolutions")
      .select("*, professionals(id, name, last_name)")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      ...row,
      professional: row.professionals ?? null
    })) as ClinicalEvolutionWithProfessional[];
  } catch (error) {
    console.error("Failed to load clinical evolutions", error);
    throw new FriendlyDataError("No pudimos cargar el registro clínico.");
  }
}

function mapPatient(row: any): PatientWithAppointments {
  return {
    ...(row as Patient),
    appointments: (row.appointments ?? []).map(mapAppointment)
  };
}

function mapAppointment(row: any): AppointmentWithRelations {
  return {
    ...(row as Appointment),
    patient: row.patients ?? null,
    professional: row.professionals ?? null,
    service: row.services ?? null,
    location: row.locations ?? null,
    public_links: row.appointment_public_links ?? []
  };
}

function mapProfessional(row: any): ProfessionalWithRelations {
  return {
    ...(row as Professional),
    specialties: (row.professional_specialties ?? [])
      .map((item: any) => item.specialties)
      .filter(Boolean),
    services: (row.professional_services ?? [])
      .map((item: any) => item.services)
      .filter(Boolean),
    availability_rules: row.availability_rules ?? []
  };
}

function mapService(row: any): ServiceWithRelations {
  return {
    ...(row as Service),
    specialty: row.specialties ?? null,
    professionals: (row.professional_services ?? [])
      .map((item: any) => item.professionals)
      .filter(Boolean)
  };
}

function mapAvailabilityRule(row: any): AvailabilityRuleWithRelations {
  return {
    ...(row as AvailabilityRule),
    professional: row.professionals ?? null,
    location: row.locations ?? null
  };
}

function mapFallbackProfessional(item: any): ProfessionalWithRelations {
  return {
    id: item.id,
    clinic_id: "demo",
    name: item.name,
    last_name: item.lastName,
    slug: item.id,
    email: item.email,
    phone: item.phone,
    license_number: item.licenseNumber,
    bio: item.bio,
    avatar_url: null,
    consultation_minutes: item.consultationMinutes,
    active: item.active,
    created_at: new Date().toISOString(),
    specialties: item.specialties.map((name: string) => ({
      id: name,
      clinic_id: "demo",
      name,
      description: null,
      active: true
    })),
    services: []
  };
}

function mapFallbackProfessionalById(idOrSlug: string) {
  const found = fallbackProfessionals.find((item) => item.id === idOrSlug);
  return found ? mapFallbackProfessional(found) : null;
}

function mapFallbackService(item: any): ServiceWithRelations {
  return {
    id: item.id,
    clinic_id: "demo",
    specialty_id: item.specialty,
    name: item.name,
    slug: item.id,
    description: null,
    duration_minutes: item.durationMinutes,
    price: item.price,
    active: item.active,
    financing_enabled: item.financingEnabled,
    deposit_required: item.depositRequired,
    public_booking_enabled: true,
    specialty: {
      id: item.specialty,
      clinic_id: "demo",
      name: item.specialty,
      description: null,
      active: true
    },
    professionals: []
  };
}

function mapFallbackAvailabilityRule(item: any): AvailabilityRuleWithRelations {
  return {
    id: item.id,
    clinic_id: "demo",
    professional_id: item.professionalName,
    location_id: null,
    day_of_week: dayLabelToNumber(item.day),
    start_time: item.startTime,
    end_time: item.endTime,
    slot_duration_minutes: item.slotDurationMinutes,
    active: item.active,
    professional: {
      id: item.professionalName,
      clinic_id: "demo",
      name: item.professionalName,
      last_name: "",
      slug: item.professionalName,
      email: null,
      phone: null,
      license_number: null,
      bio: null,
      avatar_url: null,
      consultation_minutes: item.slotDurationMinutes,
      active: true,
      created_at: new Date().toISOString()
    },
    location: {
      id: item.location,
      clinic_id: "demo",
      name: item.location,
      address: null,
      phone: null,
      active: true
    }
  };
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function rangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

export function zonedDateTimeToUtcIso(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timezone);
  return new Date(utcGuess.getTime() - offsetMs).toISOString();
}

function getTimeZoneOffsetMs(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function getDateInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getMinutesInTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function addDaysToDateString(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function dayLabelToNumber(day: string) {
  return ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"].indexOf(day);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
