import { makeSupabase } from "../_lib/supabase.js";
import { allowOnly, handleError } from "../_lib/http.js";
import { authenticateAdmin } from "./_lib.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_TO_STATUS = {
  approve_cancellation: "approved",
  reject: "rejected",
  mark_managed: "managed"
};

// Lista (GET, sin id) y accion sobre un item puntual (PATCH ?id=...) en un
// solo archivo - liberamos un lugar bajo el tope de 12 funciones
// serverless de Vercel Hobby para poder agregar el dispatcher de emails.
export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET", "PATCH"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    const auth = await authenticateAdmin(client, req);
    if (auth === "UNAUTHENTICATED") return res.status(401).json({ error: "UNAUTHENTICATED" });
    if (auth === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });

    if (req.method === "GET") return listRequests(client, auth, res);
    return updateRequest(client, auth, req, res);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listRequests(client, auth, res) {
  const { data, error: queryError } = await client
    .from("appointment_requests")
    .select(
      `id, appointment_id, type, status, requested_by, notes, created_at,
       appointments!inner(
         id, status, starts_at, clinic_id,
         patients(first_name, last_name),
         services(name),
         professionals(name, last_name),
         clinics(name, timezone, address),
         locations(address)
       )`
    )
    .eq("appointments.clinic_id", auth.clinicId)
    .order("created_at", { ascending: false });
  if (queryError) throw queryError;

  return res.status(200).json({ requests: (data ?? []).map(toRequestResponse) });
}

async function updateRequest(client, auth, req, res) {
  const requestId = String(req.query?.id ?? "");
  if (!UUID_RE.test(requestId)) {
    return res.status(400).json({ error: "INVALID_REQUEST_ID" });
  }

  const action = req.body?.action;
  const nextStatus = ACTION_TO_STATUS[action];
  if (!nextStatus) {
    return res.status(400).json({ error: "INVALID_ACTION" });
  }

  const { data: existing, error: fetchError } = await client
    .from("appointment_requests")
    .select("id, type, status, appointment_id, appointments!inner(id, clinic_id)")
    .eq("id", requestId)
    .eq("appointments.clinic_id", auth.clinicId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
  if (existing.status !== "pending") {
    return res.status(409).json({ error: "REQUEST_ALREADY_RESOLVED" });
  }
  if (action === "approve_cancellation" && existing.type !== "cancellation") {
    return res.status(400).json({ error: "ACTION_NOT_ALLOWED_FOR_TYPE" });
  }
  if (action === "mark_managed" && existing.type !== "reschedule") {
    return res.status(400).json({ error: "ACTION_NOT_ALLOWED_FOR_TYPE" });
  }

  const { error: updateError } = await client
    .from("appointment_requests")
    .update({ status: nextStatus })
    .eq("id", requestId);
  if (updateError) throw updateError;

  if (action === "approve_cancellation") {
    const { error: appointmentError } = await client
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", existing.appointment_id)
      .eq("clinic_id", auth.clinicId);
    if (appointmentError) throw appointmentError;
  }

  return res.status(200).json({ ok: true, status: nextStatus });
}

function toRequestResponse(row) {
  const appointment = row.appointments ?? {};
  const patient = appointment.patients ?? {};
  const service = appointment.services ?? {};
  const professional = appointment.professionals ?? {};
  const clinic = appointment.clinics ?? {};
  const location = appointment.locations ?? {};
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    notes: row.notes,
    requested_by: row.requested_by,
    created_at: row.created_at,
    appointment: {
      id: appointment.id ?? row.appointment_id,
      status: appointment.status ?? null,
      starts_at: appointment.starts_at ?? null,
      patient_name: [patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Paciente",
      service_name: service.name ?? "Consulta",
      professional_name: [professional.name, professional.last_name].filter(Boolean).join(" ") || "A confirmar",
      clinic_name: clinic.name ?? "Medin",
      timezone: clinic.timezone ?? "America/Argentina/Mendoza",
      location_address: location.address ?? clinic.address ?? null
    }
  };
}
