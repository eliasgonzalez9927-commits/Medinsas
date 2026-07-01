import { UserRole } from "../types/database";
import { CLINICAL_ROLES } from "./auth-roles";

type PermissionKey =
  | "canManageClinic"
  | "canManageUsers"
  | "canManageAppointments"
  | "canManagePatients"
  | "canManageBilling"
  | "canManageMedicalDocuments"
  | "canViewReports"
  | "canSendMessages";

const permissionsByRole: Record<UserRole, Record<PermissionKey, boolean>> = {
  platform_admin: all(true),
  clinic_admin: all(true),
  receptionist: {
    ...all(false),
    canManageAppointments: true,
    canManagePatients: true,
    canManageBilling: true,
    canSendMessages: true
  },
  professional: {
    ...all(false),
    canManageAppointments: true,
    canManagePatients: true,
    canManageMedicalDocuments: true
  },
  patient: all(false),
  admin: all(true),
  doctor: {
    ...all(false),
    canManageAppointments: true,
    canManagePatients: true,
    canManageMedicalDocuments: true
  }
};

function all(value: boolean): Record<PermissionKey, boolean> {
  return {
    canManageClinic: value,
    canManageUsers: value,
    canManageAppointments: value,
    canManagePatients: value,
    canManageBilling: value,
    canManageMedicalDocuments: value,
    canViewReports: value,
    canSendMessages: value
  };
}

export function getPermissions(role?: UserRole | null) {
  return role ? permissionsByRole[role] ?? all(false) : all(false);
}

export function canManageClinic(role?: UserRole | null) {
  return getPermissions(role).canManageClinic;
}

export function canManageUsers(role?: UserRole | null) {
  return getPermissions(role).canManageUsers;
}

export function canManageAppointments(role?: UserRole | null) {
  return getPermissions(role).canManageAppointments;
}

export function canCreateOverbooking(role?: UserRole | null) {
  return Boolean(role && ["platform_admin", "clinic_admin", "receptionist", "admin"].includes(role));
}

export function canManagePatients(role?: UserRole | null) {
  return getPermissions(role).canManagePatients;
}

export function canManageBilling(role?: UserRole | null) {
  return getPermissions(role).canManageBilling;
}

export function canManageMedicalDocuments(role?: UserRole | null) {
  return getPermissions(role).canManageMedicalDocuments;
}

export function canViewReports(role?: UserRole | null) {
  return getPermissions(role).canViewReports;
}

export function canSendMessages(role?: UserRole | null) {
  return getPermissions(role).canSendMessages;
}

export function canViewClinicalRecords(role?: UserRole | null) {
  return Boolean(role && CLINICAL_ROLES.includes(role));
}
