import { makeSupabase } from "../../../_lib/supabase.js";
import { allowOnly, handleError } from "../../../_lib/http.js";
import { findAppointmentByToken } from "../_lib.js";

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  const token = String(req.query?.token ?? "");
  if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });

  try {
    const result = await findAppointmentByToken(client, token);
    if (result.error) return res.status(404).json({ error: result.error });
    const appointment = result.appointment;
    if (!appointment.starts_at) return res.status(422).json({ error: "APPOINTMENT_WITHOUT_SCHEDULE" });

    const ics = buildIcsEvent(appointment);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="turno-medin-${appointment.id}.ics"`);
    return res.status(200).send(ics);
  } catch (err) {
    return handleError(res, err);
  }
}

function buildIcsEvent(appointment) {
  const service = appointment.services ?? {};
  const clinic = appointment.clinics ?? {};
  const professional = appointment.professionals ?? {};
  const location = appointment.locations ?? {};
  const start = new Date(appointment.starts_at);
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
