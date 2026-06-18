export const permissionMatrix = {
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
  admin: all(true),
  doctor: {
    ...all(false),
    canManageAppointments: true,
    canManagePatients: true,
    canManageMedicalDocuments: true
  },
  patient: all(false)
};

function all(value) {
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

export function getPermissions(role) {
  return permissionMatrix[role] ?? all(false);
}

export function assertPermission(role, permission) {
  if (!getPermissions(role)[permission]) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
}
