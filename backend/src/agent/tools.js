import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { assertCanUseTool, canUseTool, ROLES } from "../security/roles.js";

// FASE 0 SEGURIDAD: toolDefinitions vaciado — el agente opera sin tools hasta que
// se implemente multi-clínica, routing por phone_number_id y audit trail completo.
// Las implementaciones de cada tool se preservan abajo para referencia futura.
export const toolDefinitions = [];

const _disabledToolDefinitions = [
  {
    type: "function",
    name: "get_daily_schedule",
    description:
      "Devuelve los turnos de una fecha especifica. Solo puede ser usada por medicos o administradores.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        date: {
          type: "string",
          description: "Fecha en formato YYYY-MM-DD."
        }
      },
      required: ["date"]
    }
  },
  {
    type: "function",
    name: "book_appointment",
    description:
      "Reserva un turno para el paciente autenticado por WhatsApp en una especialidad, fecha y horario.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        specialty: {
          type: "string",
          description: "Especialidad solicitada, por ejemplo cardiologia, odontologia o clinica medica."
        },
        date: {
          type: "string",
          description: "Fecha del turno en formato YYYY-MM-DD."
        },
        time: {
          type: "string",
          description: "Hora del turno en formato HH:mm, 24 horas."
        }
      },
      required: ["specialty", "date", "time"]
    }
  },
  {
    type: "function",
    name: "get_medical_record",
    description:
      "Consulta la historia clinica. Pacientes solo pueden consultar la propia; medicos pueden consultar por patient_id si el usuario lo proporciona.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        patient_id: {
          type: "string",
          description:
            "UUID del paciente. Opcional para pacientes; requerido si un medico consulta una historia especifica."
        }
      },
      required: []
    }
  },
  {
    type: "function",
    name: "get_clinic_metrics",
    description:
      "Devuelve ingresos estimados y ausentismo del mes. Uso exclusivo para administradores.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        month: {
          type: "string",
          description: "Mes en formato YYYY-MM. Si se omite, usa el mes actual."
        }
      },
      required: []
    }
  }
];

export function getToolsForRole(role) {
  return toolDefinitions.filter((tool) => canUseTool(role, tool.name));
}

const schemas = {
  get_daily_schedule: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }),
  book_appointment: z.object({
    specialty: z.string().min(2).max(120),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/)
  }),
  get_medical_record: z.object({
    patient_id: z.string().uuid().optional()
  }),
  get_clinic_metrics: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/).optional()
  })
};

export async function executeToolCall({ toolName, rawArguments, user }) {
  assertCanUseTool(user.role, toolName);

  const parsedArguments = schemas[toolName].parse(JSON.parse(rawArguments || "{}"));

  if (toolName === "get_daily_schedule") {
    return getDailySchedule(parsedArguments);
  }

  if (toolName === "book_appointment") {
    return bookAppointment(parsedArguments, user);
  }

  if (toolName === "get_medical_record") {
    return getMedicalRecord(parsedArguments, user);
  }

  if (toolName === "get_clinic_metrics") {
    return getClinicMetrics(parsedArguments, user);
  }

  const error = new Error(`Unknown tool: ${toolName}`);
  error.statusCode = 400;
  throw error;
}

async function getDailySchedule({ date }) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, starts_at, appointment_type, status, reason, specialty, profiles:patient_id(full_name, phone)"
    )
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .order("starts_at", { ascending: true });

  if (error) throw error;
  return { date, appointments: data ?? [] };
}

async function bookAppointment({ specialty, date, time }, user) {
  const startsAt = new Date(`${date}T${time}:00.000Z`).toISOString();

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      patient_id: user.id,
      starts_at: startsAt,
      appointment_type: "in_person",
      status: "pending",
      reason: `Reserva solicitada por WhatsApp para ${specialty}`,
      specialty
    })
    .select("id, starts_at, status, specialty")
    .single();

  if (error) throw error;
  return { appointment: data };
}

async function getMedicalRecord({ patient_id }, user) {
  const requestedPatientId = user.role === ROLES.PATIENT ? user.id : patient_id;

  if (!requestedPatientId) {
    const error = new Error("patient_id is required for doctors.");
    error.statusCode = 400;
    throw error;
  }

  const { data, error } = await supabase
    .from("medical_records")
    .select("id, patient_id, summary, diagnosis, allergies, medications, created_at, updated_at")
    .eq("patient_id", requestedPatientId)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return { patient_id: requestedPatientId, records: data ?? [] };
}

async function getClinicMetrics({ month }) {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const start = new Date(`${targetMonth}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const { data: appointments, error: appointmentsError } = await supabase
    .from("appointments")
    .select("id, status, starts_at")
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString());

  if (appointmentsError) throw appointmentsError;

  const { data: payments, error: paymentsError } = await supabase
    .from("treatment_payments")
    .select("amount, paid_at")
    .gte("paid_at", start.toISOString())
    .lt("paid_at", end.toISOString());

  if (paymentsError) throw paymentsError;

  const totalAppointments = appointments?.length ?? 0;
  const noShows = appointments?.filter((appointment) => appointment.status === "no_show").length ?? 0;
  const revenue = payments?.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) ?? 0;

  return {
    month: targetMonth,
    revenue,
    totalAppointments,
    noShowRate: totalAppointments > 0 ? Number((noShows / totalAppointments).toFixed(4)) : 0
  };
}
