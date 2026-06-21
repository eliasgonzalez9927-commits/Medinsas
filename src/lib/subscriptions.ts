import { supabase } from "./supabase";

export async function getClinicSubscription(clinicId: string) {
  const { data, error } = await supabase.from("clinic_subscriptions").select("*, subscription_plans(*)").eq("clinic_id", clinicId).maybeSingle();
  if (error) throw error;
  return data as any;
}

export async function getPlanLimits(clinicId: string) {
  return (await getClinicSubscription(clinicId))?.subscription_plans ?? null;
}

export async function getClinicUsage(clinicId: string) {
  const [professionals, users, locations, patients, services, appointments, messages] = await Promise.all([
    supabase.from("professionals").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    supabase.from("message_logs").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId)
  ]);
  return { professionals: professionals.count ?? 0, users: users.count ?? 0, locations: locations.count ?? 0, patients: patients.count ?? 0, services: services.count ?? 0, appointments: appointments.count ?? 0, messages: messages.count ?? 0 };
}

export function isWithinLimit(current: number, limit?: number | null) { return limit == null || current <= limit; }
export async function canAddProfessional(clinicId: string) { const [limits, usage] = await Promise.all([getPlanLimits(clinicId), getClinicUsage(clinicId)]); return isWithinLimit(usage.professionals + 1, limits?.max_professionals); }
export async function canAddUser(clinicId: string) { const [limits, usage] = await Promise.all([getPlanLimits(clinicId), getClinicUsage(clinicId)]); return isWithinLimit(usage.users + 1, limits?.max_users); }
export async function canAddLocation(clinicId: string) { const [limits, usage] = await Promise.all([getPlanLimits(clinicId), getClinicUsage(clinicId)]); return isWithinLimit(usage.locations + 1, limits?.max_locations); }
export async function canImportPatients(clinicId: string, count: number) { const [limits, usage] = await Promise.all([getPlanLimits(clinicId), getClinicUsage(clinicId)]); return isWithinLimit(usage.patients + count, limits?.max_patients); }
export async function canUseModule(clinicId: string, moduleKey: string) { const { data } = await supabase.from("clinic_modules").select("enabled").eq("clinic_id", clinicId).eq("module_key", moduleKey).maybeSingle(); return Boolean(data?.enabled); }
