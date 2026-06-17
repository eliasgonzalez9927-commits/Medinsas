export const ROLES = {
  PATIENT: "patient",
  DOCTOR: "doctor",
  ADMIN: "admin"
};

export const TOOL_PERMISSIONS = {
  get_daily_schedule: [ROLES.DOCTOR, ROLES.ADMIN],
  book_appointment: [ROLES.PATIENT],
  get_medical_record: [ROLES.PATIENT, ROLES.DOCTOR],
  get_clinic_metrics: [ROLES.ADMIN]
};

export function canUseTool(role, toolName) {
  return Boolean(TOOL_PERMISSIONS[toolName]?.includes(role));
}

export function assertCanUseTool(role, toolName) {
  if (!canUseTool(role, toolName)) {
    const error = new Error(`Tool ${toolName} is not allowed for role ${role}.`);
    error.statusCode = 403;
    error.code = "TOOL_FORBIDDEN";
    throw error;
  }
}
