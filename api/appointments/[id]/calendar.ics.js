import crypto from "node:crypto";
import { makeSupabase } from "../../_lib/supabase.js";
import { allowOnly, handleError } from "../../_lib/http.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// GET  -> descarga el .ics del turno
// POST -> genera/reusa el link privado publico (mi-turno/:token)
// Consolidados en un solo archivo (misma logica que ya se aplico en
// appointment-requests/index.js) para no sumar una funcion serverless mas
// bajo el tope de 12 de Vercel Hobby - liberamos este lugar para
// api/invoices/[id].js.
export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET", "POST"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  const appointmentId = String(req.query?.id ?? "");
  if (!UUID_RE.test(appointmentId)) {
    return res.status(400).json({ error: "INVALID_APPOINTMENT_ID" });
  }

  try {
    if (req.method === "POST") return handlePublicLink(client, req, res, appointmentId);
    return handleCalendarIcs(client, res, appointmentId);
  } catch (err) {
    return handleError(res, err);
  }
}

async function handlePublicLink(client, req, res, appointmentId) {
  const { data: appointment, error: fetchError } = await client
    .from("appointments")
    .select("id, public_code")
    .eq("id", appointmentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!appointment) return res.status(404).json({ error: "APPOINTMENT_NOT_FOUND" });

  const token = await ensurePublicLink(client, appointmentId);
  const publicUrl = (process.env.APP_PUBLIC_URL || `https://${req.headers.host}`).replace(/\/$/, "");

  return res.status(200).json({
    token,
    public_code: appointment.public_code ?? null,
    url: `${publicUrl}/mi-turno/${token}`
  });
}

async function ensurePublicLink(client, appointmentId) {
  const { data: existing, error: existingError } = await client
    .from("appointment_public_links")
    .select("token, expires_at, revoked_at")
    .eq("appointment_id", appointmentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) {
    return existing.token;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const { data, error } = await client
    .from("appointment_public_links")
    .insert({
      appointment_id: appointmentId,
      token,
      expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select("token")
    .single();
  if (error) throw error;
  return data.token;
}

async function handleCalendarIcs(client, res, appointmentId) {
  const { data: appointment, error: fetchError } = await client
    .from("appointments")
    .select("*, clinics(name, address, phone), services(name, duration_minutes), professionals(name, last_name), locations(address)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!appointment) return res.status(404).json({ error: "APPOINTMENT_NOT_FOUND" });

  const startsAt = appointment.starts_at ?? appointment.start_time;
  if (!startsAt) return res.status(422).json({ error: "APPOINTMENT_WITHOUT_SCHEDULE" });

  const ics = buildIcsEvent(appointment);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="turno-medin-${appointment.id}.ics"`);
  return res.status(200).send(ics);
}

function buildIcsEvent(appointment) {
  const service = appointment.services ?? {};
  const clinic = appointment.clinics ?? {};
  const professional = appointment.professionals ?? {};
  const location = appointment.locations ?? {};
  const startsAt = appointment.starts_at ?? appointment.start_time;
  const start = new Date(startsAt);
  const end = appointment.end_time
    ? new Date(appointment.end_time)
    : new Date(start.getTime() + Number(service.duration_minutes ?? 30) * 60_000);
  const title = `Turno en ${clinic.name ?? "Medin"} - ${service.name ?? appointment.reason ?? "Consulta"}`;
  const description = [
    `Servicio: ${service.name ?? "Consulta"}`,
    `Profesional: ${[professional.name, professional.last_name].filter(Boolean).join(" ") || "A confirmar"}`,
    clinic.phone ? `Contacto: ${clinic.phone}` : ""
  ]
    .filter(Boolean)
    .join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Medin//Medin//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@medin`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcs(title)}`,
    `LOCATION:${escapeIcs(location.address ?? clinic.address ?? "")}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

function toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
