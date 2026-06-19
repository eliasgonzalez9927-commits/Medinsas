import { Clinic } from "../types/clinic";
import { ClinicModuleKey } from "./modules";
import { supabase } from "./supabase";

export const ALL_MODULES: ClinicModuleKey[] = [
  "agenda",
  "pacientes",
  "profesionales",
  "servicios",
  "disponibilidad",
  "reservas_online",
  "mensajes",
  "whatsapp",
  "pagos",
  "mercado_pago",
  "financiacion",
  "facturacion",
  "recetarios",
  "historia_clinica",
  "obras_sociales",
  "importaciones",
  "reportes"
];

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  currency: string;
  active: boolean;
};

export type ClinicModule = {
  id: string;
  clinic_id: string;
  module_key: ClinicModuleKey;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type ClinicSubscription = {
  id: string;
  clinic_id: string;
  plan_id: string | null;
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled" | string;
  billing_cycle: string;
  trial_ends_at: string | null;
  subscription_plans?: SubscriptionPlan | null;
};

export type SuperadminClinic = Clinic & {
  clinic_subscriptions?: ClinicSubscription[];
  clinic_modules?: ClinicModule[];
  counts?: {
    users: number;
    professionals: number;
    patients: number;
    appointments: number;
    locations: number;
  };
};

export type ClinicFormPayload = {
  name: string;
  legal_name?: string | null;
  cuit?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  slug: string;
  timezone: string;
  status: string;
  plan: string;
  active: boolean;
  modules: ClinicModuleKey[];
};

export async function getSuperadminOverview() {
  const [clinics, appointments, payments, members] = await Promise.all([
    listClinics(),
    supabase.from("appointments").select("id, starts_at", { count: "exact", head: true }).gte("starts_at", startOfMonthIso()),
    supabase.from("payments").select("id, amount, status", { count: "exact" }).eq("status", "approved"),
    supabase.from("clinic_members").select("id", { count: "exact", head: true }).eq("active", true)
  ]);
  const active = clinics.filter((clinic) => clinic.active && clinic.status !== "cancelled").length;
  const trial = clinics.filter((clinic) => clinic.clinic_subscriptions?.[0]?.status === "trial" || clinic.status === "trial").length;
  const processed = (payments.data ?? []).reduce((sum: number, payment: any) => sum + Number(payment.amount ?? 0), 0);
  const moduleUsage = calculateModuleUsage(clinics);
  return {
    clinics,
    cards: {
      active,
      trial,
      appointmentsThisMonth: appointments.count ?? 0,
      processedPayments: processed,
      activeUsers: members.count ?? 0,
      moduleUsage
    }
  };
}

export async function listClinics(): Promise<SuperadminClinic[]> {
  const { data, error } = await supabase
    .from("clinics")
    .select("*, clinic_subscriptions(*, subscription_plans(*)), clinic_modules(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const clinics = (data ?? []) as SuperadminClinic[];
  const counts = await Promise.all(clinics.map((clinic) => loadClinicCounts(clinic.id)));
  return clinics.map((clinic, index) => ({ ...clinic, counts: counts[index] }));
}

export async function getClinicDetail(id: string): Promise<SuperadminClinic | null> {
  const { data, error } = await supabase
    .from("clinics")
    .select("*, clinic_subscriptions(*, subscription_plans(*)), clinic_modules(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as SuperadminClinic), counts: await loadClinicCounts(id) };
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase.from("subscription_plans").select("*").eq("active", true).order("monthly_price");
  if (error) throw error;
  return (data ?? []) as SubscriptionPlan[];
}

export async function createClinic(payload: ClinicFormPayload) {
  const slug = normalizeSlug(payload.slug);
  const existing = await supabase.from("clinics").select("id").eq("slug", slug).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) throw new Error("Ese slug ya existe.");

  const { data: clinic, error } = await supabase
    .from("clinics")
    .insert({
      name: payload.name,
      legal_name: payload.legal_name || null,
      cuit: payload.cuit || null,
      email: payload.email || null,
      phone: payload.phone || null,
      whatsapp: payload.whatsapp || null,
      address: payload.address || null,
      slug,
      timezone: payload.timezone || "America/Argentina/Mendoza",
      status: payload.status,
      plan: payload.plan,
      active: payload.active
    })
    .select("*")
    .single();
  if (error) throw error;

  await seedClinicBase(clinic.id, payload.modules);
  await logAudit({ clinicId: clinic.id, action: "clinic_created", entityType: "clinic", entityId: clinic.id, metadata: { slug } });
  return clinic as Clinic;
}

export async function updateClinic(id: string, payload: Partial<ClinicFormPayload>) {
  const { data, error } = await supabase
    .from("clinics")
    .update({
      name: payload.name,
      legal_name: payload.legal_name || null,
      cuit: payload.cuit || null,
      email: payload.email || null,
      phone: payload.phone || null,
      whatsapp: payload.whatsapp || null,
      address: payload.address || null,
      timezone: payload.timezone,
      status: payload.status,
      plan: payload.plan,
      active: payload.active,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  await logAudit({ clinicId: id, action: payload.active === false ? "clinic_disabled" : "clinic_updated", entityType: "clinic", entityId: id, metadata: payload });
  return data as Clinic;
}

export async function setClinicModule(clinicId: string, moduleKey: ClinicModuleKey, enabled: boolean) {
  const { error } = await supabase
    .from("clinic_modules")
    .upsert({ clinic_id: clinicId, module_key: moduleKey, enabled, updated_at: new Date().toISOString() }, { onConflict: "clinic_id,module_key" });
  if (error) throw error;
  await logAudit({ clinicId, action: enabled ? "module_enabled" : "module_disabled", entityType: "clinic_module", metadata: { moduleKey } });
}

export async function getOnboardingProgress(clinicId: string) {
  const [clinic, locations, members, professionals, services, availability, booking, payments] = await Promise.all([
    getClinicDetail(clinicId),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    supabase.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("professionals").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("availability_rules").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).eq("active", true),
    supabase.from("booking_settings").select("public_booking_enabled").eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("payment_settings").select("active").eq("clinic_id", clinicId).eq("provider", "mercado_pago").maybeSingle()
  ]);
  const steps = [
    step("clinic_data", "Datos de clínica", Boolean(clinic?.name && clinic?.slug), "/admin/configuracion", clinic?.name ?? "Sin nombre"),
    step("locations", "Sedes", (locations.count ?? 0) > 0, "/admin/configuracion/sedes", `${locations.count ?? 0} cargadas`),
    step("users", "Usuarios", (members.count ?? 0) > 0, "/admin/configuracion/usuarios", `${members.count ?? 0} activos`),
    step("professionals", "Profesionales", (professionals.count ?? 0) > 0, "/admin/profesionales", `${professionals.count ?? 0} cargados`),
    step("services", "Servicios", (services.count ?? 0) > 0, "/admin/servicios", `${services.count ?? 0} cargados`),
    step("availability", "Horarios y disponibilidad", (availability.count ?? 0) > 0, "/admin/disponibilidad", `${availability.count ?? 0} reglas activas`),
    step("online_booking", "Reserva online", Boolean(booking.data?.public_booking_enabled), "/admin/booking", booking.data?.public_booking_enabled ? "Activa" : "Inactiva"),
    step("payments", "Pagos / Mercado Pago", Boolean(payments.data?.active), "/admin/pagos/configuracion", payments.data?.active ? "Configurado" : "Pendiente"),
    step("finish", "Finalizar", false, "/admin", "Revisión final")
  ];
  const completed = steps.filter((item) => item.status === "completed").length;
  return { steps, percent: Math.round((completed / steps.length) * 100) };
}

async function seedClinicBase(clinicId: string, modules: ClinicModuleKey[]) {
  const proPlan = await supabase.from("subscription_plans").select("id").eq("name", "Pro").maybeSingle();
  await Promise.all([
    supabase.from("booking_settings").insert({ clinic_id: clinicId, public_booking_enabled: true }),
    supabase.from("fiscal_settings").insert({ clinic_id: clinicId, arca_integration_status: "pending_configuration" }),
    supabase.from("payment_settings").insert({ clinic_id: clinicId, provider: "mercado_pago", active: false, mode: "sandbox", default_currency: "ARS" }),
    supabase.from("clinic_subscriptions").insert({ clinic_id: clinicId, plan_id: proPlan.data?.id ?? null, status: "trial", trial_ends_at: addDaysIso(14) }),
    supabase.from("clinic_modules").insert(ALL_MODULES.map((moduleKey) => ({ clinic_id: clinicId, module_key: moduleKey, enabled: modules.includes(moduleKey) }))),
    supabase.from("clinic_onboarding_steps").insert(["clinic_data", "locations", "users", "professionals", "services", "availability", "online_booking", "payments", "finish"].map((stepKey) => ({ clinic_id: clinicId, step_key: stepKey })))
  ]);
}

async function loadClinicCounts(clinicId: string) {
  const [users, professionals, patients, appointments, locations] = await Promise.all([
    supabase.from("clinic_members").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    supabase.from("professionals").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId),
    supabase.from("locations").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId)
  ]);
  return { users: users.count ?? 0, professionals: professionals.count ?? 0, patients: patients.count ?? 0, appointments: appointments.count ?? 0, locations: locations.count ?? 0 };
}

async function logAudit({ clinicId, action, entityType, entityId, metadata = {} }: { clinicId?: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const user = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({ clinic_id: clinicId ?? null, user_id: user.data.user?.id ?? null, action, entity_type: entityType, entity_id: entityId ?? null, metadata });
}

function step(stepKey: string, label: string, done: boolean, to: string, summary: string) {
  return { stepKey, label, status: done ? "completed" : "pending", to, summary };
}

function startOfMonthIso() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function calculateModuleUsage(clinics: SuperadminClinic[]) {
  const counts = new Map<string, number>();
  clinics.forEach((clinic) => {
    (clinic.clinic_modules ?? []).forEach((module) => {
      if (module.enabled) counts.set(module.module_key, (counts.get(module.module_key) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key, count]) => ({ key, count }));
}
