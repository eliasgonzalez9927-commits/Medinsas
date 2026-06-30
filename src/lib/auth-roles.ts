import { UserRole } from "../types/database";

export const ADMIN_ROLES: UserRole[] = ["platform_admin", "clinic_admin", "receptionist", "admin"];
export const PROFESSIONAL_ROLES: UserRole[] = ["professional", "doctor"];
export const STAFF_ROLES: UserRole[] = [...ADMIN_ROLES, ...PROFESSIONAL_ROLES];

// Roles con acceso a configuracion/administracion sensible de la clinica
// (usuarios, pagos, datos fiscales, reportes, etc). receptionist y
// professional quedan fuera: son roles operativos, no administrativos.
export const CLINIC_ADMIN_ROLES: UserRole[] = ["platform_admin", "clinic_admin", "admin"];

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
  if (role === "patient") return "/patient/book";
  return null;
}
