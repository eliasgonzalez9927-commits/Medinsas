export const ROLES = {
  PATIENT: "patient",
  DOCTOR: "doctor",
  ADMIN: "admin"
};

// FASE 0 SEGURIDAD: todas las tools bloqueadas hasta implementar multi-clínica seguro.
// get_daily_schedule: lee turnos de TODAS las clínicas sin clinic_id filter (service role).
// book_appointment: crea turnos sin clinic_id/professional_id/service_id ni validación.
// get_medical_record: expone historia clínica sensible por canal no seguro (WhatsApp).
// get_clinic_metrics: sin contexto de clínica, cruza datos multi-tenant.
// Rehabilitar tool por tool solo tras implementar routing multi-clínica y audit trail.
export const TOOL_PERMISSIONS = {};

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
