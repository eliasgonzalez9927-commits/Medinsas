import { UserRole } from "../types/database";

export const ADMIN_ROLES: UserRole[] = ["platform_admin", "clinic_admin", "receptionist", "admin"];
export const PROFESSIONAL_ROLES: UserRole[] = ["professional", "doctor"];
export const STAFF_ROLES: UserRole[] = [...ADMIN_ROLES, ...PROFESSIONAL_ROLES];

export const roleLabels: Record<UserRole, string> = {
  platform_admin: "Administrador plataforma",
  clinic_admin: "Administrador clinica",
  receptionist: "Recepcion",
  professional: "Profesional",
  patient: "Paciente",
  admin: "Administrador",
  doctor: "Medico"
};

export function isAdminRole(role?: UserRole | null) {
  return Boolean(role && ADMIN_ROLES.includes(role));
}

export function isStaffRole(role?: UserRole | null) {
  return Boolean(role && STAFF_ROLES.includes(role));
}

export function getPostLoginPath(role?: UserRole | null) {
  if (role === "receptionist") return "/admin/agenda";
  if (role === "professional" || role === "doctor") return "/admin/mi-agenda";
  if (isAdminRole(role)) return "/admin";
  if (role === "patient") return "/paciente";
  return null;
}
