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
  Clinic,
  ClinicDataResult,
  Location,
  Professional,
  ProfessionalInput,
  ProfessionalWithRelations,
  Service,
  ServiceInput,
  ServiceWithRelations,
  Specialty
} from "../types/clinic";

const DEFAULT_CLINIC_SLUG = "clinica-central";

export class FriendlyDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FriendlyDataError";
  }
}

export async function getDefaultClinic() {
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

export async function getProfessionalById(idOrSlug: string): Promise<ProfessionalWithRelations | null> {
  try {
    const query = supabase
      .from("professionals")
      .select(
        `
        *,
        professional_specialties(specialties(*)),
        professional_services(services(*)),
        availability_rules(*)
      `
      );
    const { data, error } = isUuid(idOrSlug)
      ? await query.eq("id", idOrSlug).maybeSingle()
      : await query.eq("slug", idOrSlug).maybeSingle();
    if (error) throw error;
    return data ? mapProfessional(data) : mapFallbackProfessionalById(idOrSlug);
  } catch (error) {
    console.error("Failed to load professional", error);
    return mapFallbackProfessionalById(idOrSlug);
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

export async function updateProfessional(id: string, data: Partial<ProfessionalInput>): Promise<Professional> {
  try {
    const { data: updated, error } = await supabase
      .from("professionals")
      .update(data)
      .eq("id", id)
      .select("*")
      .single();
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

export async function updateService(id: string, data: Partial<ServiceInput>): Promise<Service> {
  try {
    const { data: updated, error } = await supabase
      .from("services")
      .update(data)
      .eq("id", id)
      .select("*")
      .single();
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

export async function deleteAvailabilityRule(id: string): Promise<void> {
  try {
    const { error } = await supabase.from("availability_rules").delete().eq("id", id);
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

export async function deleteAvailabilityBlock(id: string): Promise<void> {
  try {
    const { error } = await supabase.from("availability_blocks").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    console.error("Failed to delete availability block", error);
    throw new FriendlyDataError("No pudimos eliminar el bloqueo.");
  }
}

export async function getAvailableSlots({
  clinicId,
  professionalId,
  serviceId,
  date
}: {
  clinicId: string;
  professionalId: string;
  serviceId: string;
  date: string;
}): Promise<string[]> {
  const [rulesResult, blocks, serviceResult] = await Promise.all([
    getAvailabilityRules(clinicId, professionalId),
    getAvailabilityBlocks(clinicId, professionalId),
    getServices(clinicId)
  ]);
  const service = serviceResult.data.find((item) => item.id === serviceId);
  const duration = service?.duration_minutes ?? 30;
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const rules = rulesResult.data.filter((rule) => rule.day_of_week === dayOfWeek && rule.active);
  const dayBlocks = blocks.filter((block) => block.date === date);

  return rules.flatMap((rule) => {
    const slots: string[] = [];
    let cursor = timeToMinutes(rule.start_time);
    const end = timeToMinutes(rule.end_time);
    while (cursor + duration <= end) {
      const slot = minutesToTime(cursor);
      const blocked = dayBlocks.some(
        (block) => cursor < timeToMinutes(block.end_time) && cursor + duration > timeToMinutes(block.start_time)
      );
      const isPastToday =
        date === new Date().toISOString().slice(0, 10) &&
        cursor <= new Date().getHours() * 60 + new Date().getMinutes();
      if (!blocked && !isPastToday) slots.push(slot);
      cursor += duration;
    }
    return slots;
  });
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

function dayLabelToNumber(day: string) {
  return ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"].indexOf(day);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
