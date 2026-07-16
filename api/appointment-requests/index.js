import { makeSupabase } from "../_lib/supabase.js";
import { allowOnly, handleError } from "../_lib/http.js";
import { authenticateAdmin } from "./_lib.js";

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    const auth = await authenticateAdmin(client, req);
    if (auth === "UNAUTHENTICATED") return res.status(401).json({ error: "UNAUTHENTICATED" });
    if (auth === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });

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
  } catch (err) {
    return handleError(res, err);
  }
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
