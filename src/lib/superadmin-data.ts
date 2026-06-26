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

export const PILOT_ACTIVE_MODULES: ClinicModuleKey[] = [
  "agenda",
  "pacientes",
  "profesionales",
  "servicios",
  "disponibilidad",
  "reservas_online",
  "pagos",
  "mercado_pago",
  "obras_sociales",
  "reportes"
];

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  setup_price?: number | null;
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
  current_period_start?: string;
  current_period_end?: string;
  trial_ends_at: string | null;
  setup_fee_status?: string | null;
  monthly_fee_status?: string | null;
  subscription_plans?: SubscriptionPlan | null;
};

export type ClinicUser = {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    phone: string | null;
    role: string | null;
  } | null;
};

export type SuperadminClinic = Clinic & {
  clinic_subscriptions?: ClinicSubscription[];
  clinic_modules?: ClinicModule[];
  clinic_members?: ClinicUser[];
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
  city?: string | null;
  province?: string | null;
  slug: string;
  timezone: string;
  status: string;
  plan: string;
  active: boolean;
  plan_id?: string | null;
  modules: ClinicModuleKey[];
};

export type AddClinicAdminPayload = {
  clinicId: string;
  email: string;
  fullName: string;
  phone?: string | null;
  password?: string;
  role?: "clinic_admin" | "receptionist" | "professional";
};

export async function getSuperadminOverview() {
  const [clinics, appointments, payments, members] = await Promise.all([
    listClinics(),
    supabase.from("appointments").select("id, starts_at", { count: "exact", head: true }).gte("starts_at", startOfMonthIso()),
    supabase.from("payments").select("id, amount, status", { count: "exact" }).eq("status", "approved"),
    supabase.from("clinic_members").select("id", { count: "exact", head: true }).eq("active", true)
  ]);
  const active = clinics.filter((clinic) => clinic.active && clinic.status !== "cancelled" && clinic.status !== "inactive").length;
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
    .select("*, clinic_subscriptions(*, subscription_plans(*)), clinic_modules(*), clinic_members(id, clinic_id, user_id, role, active, created_at, updated_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const clinics = (data ?? []) as SuperadminClinic[];
  const counts = await Promise.all(clinics.map((clinic) => loadClinicCounts(clinic.id)));
  return clinics.map((clinic, index) => ({ ...clinic, counts: counts[index] }));
}

export async function getClinicDetail(id: string): Promise<SuperadminClinic | null> {
  const { data, error } = await supabase
    .from("clinics")
    .select("*, clinic_subscriptions(*, subscription_plans(*)), clinic_modules(*), clinic_members(id, clinic_id, user_id, role, active, created_at, updated_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const clinic = data as SuperadminClinic;
  return { ...clinic, clinic_members: await attachProfilesToMembers(clinic.clinic_members ?? []), counts: await loadClinicCounts(id) };
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase.from("subscription_plans").select("*").eq("active", true).order("monthly_price");
  if (error) throw error;
  return (data ?? []) as SubscriptionPlan[];
}

export async function createClinic(payload: ClinicFormPayload) {
  validateClinicPayload(payload);
  const slug = normalizeSlug(payload.slug);
  const existing = await supabase.from("clinics").select("id").eq("slug", slug).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) throw new Error("Ese slug ya existe.");

  const plan = await resolvePlan(payload);
  const { data: clinic, error } = await supabase
    .from("clinics")
    .insert({
      name: payload.name.trim(),
      legal_name: payload.legal_name || null,
      cuit: payload.cuit || null,
      email: payload.email || null,
      phone: payload.phone || null,
      whatsapp: payload.whatsapp || payload.phone || null,
      address: payload.address || null,
      slug,
      timezone: payload.timezone || "America/Argentina/Mendoza",
      status: payload.status,
      plan: plan.slug,
      active: payload.active
    })
    .select("*")
    .single();
  if (error) throw error;

  await seedClinicBase(clinic.id, { ...payload, slug, plan: plan.slug, plan_id: plan.id, modules: payload.modules });
  await logAudit({ clinicId: clinic.id, action: "clinic_created", entityType: "clinic", entityId: clinic.id, metadata: { slug, plan: plan.name, status: payload.status } });
  return clinic as Clinic;
}

export async function updateClinic(id: string, payload: Partial<ClinicFormPayload>) {
  const plan = payload.plan_id || payload.plan ? await resolvePlan(payload as ClinicFormPayload).catch(() => null) : null;
  const updatePayload: Record<string, unknown> = {
    name: payload.name,
    legal_name: payload.legal_name || null,
    cuit: payload.cuit || null,
    email: payload.email || null,
    phone: payload.phone || null,
    whatsapp: payload.whatsapp || null,
    address: payload.address || null,
    timezone: payload.timezone,
    status: payload.status,
    active: payload.active,
    updated_at: new Date().toISOString()
  };
  if (plan) updatePayload.plan = plan.slug;

  const { data, error } = await supabase
    .from("clinics")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  if (plan) await upsertSubscription(id, plan, payload.status ?? data.status ?? "active");
  await logAudit({ clinicId: id, action: payload.active === false ? "clinic_status_changed" : "clinic_updated", entityType: "clinic", entityId: id, metadata: payload });
  return data as Clinic;
}

export async function setClinicModule(clinicId: string, moduleKey: ClinicModuleKey, enabled: boolean) {
  const { error } = await supabase
    .from("clinic_modules")
    .upsert({ clinic_id: clinicId, module_key: moduleKey, enabled, updated_at: new Date().toISOString() }, { onConflict: "clinic_id,module_key" });
  if (error) throw error;
  await logAudit({ clinicId, action: enabled ? "module_enabled" : "module_disabled", entityType: "clinic_module", metadata: { moduleKey } });
}

export async function addClinicAdmin(payload: AddClinicAdminPayload) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sesión no disponible.");
  const response = await fetch(`/api/superadmin/clinics/${payload.clinicId}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password || undefined,
      fullName: payload.fullName,
      phone: payload.phone || null,
      role: payload.role ?? "clinic_admin"
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No pudimos crear el usuario admin.");
  return body as { user: { id: string; email: string; created: boolean; temporaryPassword: string | null } };
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

async function seedClinicBase(clinicId: string, payload: ClinicFormPayload) {
  const plan = await resolvePlan(payload);
  await Promise.all([
    supabase.from("locations").insert({ clinic_id: clinicId, name: "Sede Central", address: payload.address || null, phone: payload.phone || null, active: true, is_primary: true }),
    supabase.from("booking_settings").insert({ clinic_id: clinicId, public_booking_enabled: true }),
    supabase.from("fiscal_settings").upsert({ clinic_id: clinicId, arca_integration_status: "pending_configuration" }, { onConflict: "clinic_id" }),
    supabase.from("payment_settings").upsert({ clinic_id: clinicId, provider: "mercado_pago", active: false, mode: "sandbox", default_currency: "ARS" }, { onConflict: "clinic_id,provider" }),
    upsertSubscription(clinicId, plan, payload.status),
    initializeModules(clinicId, payload.modules),
    supabase.from("clinic_notification_settings").upsert({
      clinic_id: clinicId,
      email_enabled: true,
      in_app_enabled: true,
      whatsapp_enabled: false,
      reminder_24h_enabled: true,
      reminder_2h_enabled: false,
      notify_new_booking: true,
      notify_payment_approved: true,
      notify_reschedule_requests: true,
      notify_cancellation_requests: true
    }, { onConflict: "clinic_id" }),
    supabase.from("clinic_onboarding_steps").upsert(["clinic_data", "locations", "users", "professionals", "services", "availability", "online_booking", "payments", "finish"].map((stepKey) => ({ clinic_id: clinicId, step_key: stepKey })), { onConflict: "clinic_id,step_key" })
  ]);
  await Promise.all([
    logAudit({ clinicId, action: "clinic_subscription_created", entityType: "clinic_subscription", metadata: { plan: plan.name } }),
    logAudit({ clinicId, action: "clinic_modules_initialized", entityType: "clinic_module", metadata: { enabled: payload.modules } }),
    logAudit({ clinicId, action: "clinic_notification_settings_created", entityType: "clinic_notification_settings" })
  ]);
}

async function initializeModules(clinicId: string, enabledModules: ClinicModuleKey[]) {
  const rows = ALL_MODULES.map((moduleKey) => ({
    clinic_id: clinicId,
    module_key: moduleKey,
    enabled: enabledModules.includes(moduleKey),
    config: {}
  }));
  const { error } = await supabase.from("clinic_modules").upsert(rows, { onConflict: "clinic_id,module_key" });
  if (error) throw error;
}

async function upsertSubscription(clinicId: string, plan: ResolvedPlan, status: string) {
  const isFree = isFreeBetaPlan(plan);
  const subscriptionStatus = status === "trial" ? "trial" : "active";
  const { error } = await supabase.from("clinic_subscriptions").upsert({
    clinic_id: clinicId,
    plan_id: plan.id,
    status: subscriptionStatus,
    billing_cycle: "monthly",
    current_period_start: new Date().toISOString(),
    current_period_end: addDaysIso(30),
    trial_ends_at: subscriptionStatus === "trial" ? addDaysIso(30) : null,
    setup_fee_status: isFree ? "waived" : "pending",
    monthly_fee_status: isFree ? "waived" : "pending",
    updated_at: new Date().toISOString()
  }, { onConflict: "clinic_id" });
  if (error) throw error;
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

async function attachProfilesToMembers(members: ClinicUser[]) {
  const userIds = members.map((member) => member.user_id).filter(Boolean);
  if (!userIds.length) return members;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role")
    .in("id", userIds);
  if (error) throw error;
  const profiles = new Map((data ?? []).map((profile: any) => [profile.id, profile]));
  return members.map((member) => ({
    ...member,
    profiles: profiles.get(member.user_id) ?? null
  }));
}

async function logAudit({ clinicId, action, entityType, entityId, metadata = {} }: { clinicId?: string; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const user = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({ clinic_id: clinicId ?? null, user_id: user.data.user?.id ?? null, action, entity_type: entityType, entity_id: entityId ?? null, metadata });
}

type ResolvedPlan = { id: string; name: string; slug: string; monthly_price?: number; setup_price?: number | null };

async function resolvePlan(payload: Pick<ClinicFormPayload, "plan" | "plan_id">): Promise<ResolvedPlan> {
  let query = supabase.from("subscription_plans").select("id, name, monthly_price, setup_price");
  if (payload.plan_id) query = query.eq("id", payload.plan_id);
  else query = query.ilike("name", planNameFromSlug(payload.plan || "Pro"));
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Seleccioná un plan válido.");
  return { ...data, slug: normalizePlanSlug(data.name) };
}

function validateClinicPayload(payload: ClinicFormPayload) {
  if (!payload.name.trim()) throw new Error("El nombre de la clínica es requerido.");
  if (!normalizeSlug(payload.slug)) throw new Error("El slug público es requerido.");
  if (!payload.plan_id && !payload.plan) throw new Error("Seleccioná un plan inicial.");
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error("El email administrativo no es válido.");
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

export function normalizeSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizePlanSlug(value: string) {
  const normalized = normalizeSlug(value);
  if (normalized === "free-beta" || normalized === "free" || normalized === "beta") return "free_beta";
  return normalized.replace(/-/g, "_");
}

function planNameFromSlug(value: string) {
  if (value === "free_beta") return "Free Beta";
  return value.split(/[_-]/g).filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

function isFreeBetaPlan(plan: ResolvedPlan) {
  return normalizePlanSlug(plan.name) === "free_beta" || Number(plan.monthly_price ?? 0) === 0;
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
