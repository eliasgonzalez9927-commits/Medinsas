import { UserRole } from "../types/database";

export const ADMIN_ROLES: UserRole[] = ["platform_admin", "clinic_admin", "receptionist", "professional", "admin"];

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
