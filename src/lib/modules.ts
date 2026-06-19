import { supabase } from "./supabase";

export type ClinicModuleKey =
  | "agenda"
  | "pacientes"
  | "profesionales"
  | "servicios"
  | "disponibilidad"
  | "reservas_online"
  | "mensajes"
  | "whatsapp"
  | "pagos"
  | "mercado_pago"
  | "financiacion"
  | "facturacion"
  | "recetarios"
  | "historia_clinica"
  | "obras_sociales"
  | "importaciones"
  | "reportes";

export const BASE_MODULES: ClinicModuleKey[] = ["agenda", "pacientes", "profesionales", "servicios", "disponibilidad"];

export async function isModuleEnabled(clinicId: string, moduleKey: ClinicModuleKey) {
  if (BASE_MODULES.includes(moduleKey)) return true;
  const { data, error } = await supabase
    .from("clinic_modules")
    .select("enabled")
    .eq("clinic_id", clinicId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (error) throw error;
  return data?.enabled ?? false;
}

export function canUsePayments(modules: Record<string, boolean>) {
  return Boolean(modules.pagos || modules.mercado_pago);
}

export function canUseMessaging(modules: Record<string, boolean>) {
  return Boolean(modules.mensajes);
}

export function canUseBilling(modules: Record<string, boolean>) {
  return Boolean(modules.facturacion);
}

export function canUsePrescriptions(modules: Record<string, boolean>) {
  return Boolean(modules.recetarios);
}

export function canUseClinicalRecords(modules: Record<string, boolean>) {
  return Boolean(modules.historia_clinica);
}

export function canUseImports(modules: Record<string, boolean>) {
  return Boolean(modules.importaciones);
}

export function canUseWhatsApp(modules: Record<string, boolean>) {
  return Boolean(modules.whatsapp);
}

export function canUseHealthCoverages(modules: Record<string, boolean>) {
  return Boolean(modules.obras_sociales);
}
