import { makeSupabase } from "../../_lib/supabase.js";
import { handleError } from "../../_lib/http.js";
import { findAppointmentByToken } from "./_lib.js";

const INACTIVE_STATUSES = ["cancelled", "completed", "attended", "no_show"];

export default async function handler(req, res) {
  const segments = Array.isArray(req.query?.action) ? req.query.action : [req.query?.action].filter(Boolean);
  const token = String(segments[0] ?? "");
  const sub = segments[1] ?? null;

  if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    if (sub === "calendar.ics") {
      if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
      return handleCalendar(client, res, token);
    }
    if (sub === "requests") {
      if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
      return handleCreateRequest(client, req, res, token);
    }
    if (sub) return res.status(404).json({ error: "NOT_FOUND" });

    if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
    return handleDetail(client, res, token);
  } catch (err) {
    return handleError(res, err);
  }
}

function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
}

async function handleDetail(client, res, token) {
  const result = await findAppointmentByToken(client, token);
  if (result.error) return res.status(404).json({ error: result.error });
  const appointment = result.appointment;

  const { data: payment, error: paymentError } = await client
    .from("payments")
    .select("status, amount, currency, paid_at")
    .eq("appointment_id", appointment.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;

  const { data: pendingRequests, error: requestsError } = await client
    .from("appointment_requests")
    .select("type, status, created_at")
    .eq("appointment_id", appointment.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (requestsError) throw requestsError;

  return res.status(200).json(toDetailResponse(appointment, payment, pendingRequests ?? []));
}

function toDetailResponse(appointment, payment, pendingRequests) {
  const patient = appointment.patients ?? {};
  const service = appointment.services ?? {};
  const professional = appointment.professionals ?? {};
  const clinic = appointment.clinics ?? {};
  const location = appointment.locations ?? {};
  const requiresOnlinePayment = Boolean(appointment.payment_required);
  const expectedAmount = Number(appointment.deposit_amount ?? service.price ?? 0);

  return {
    appointment: {
      public_code: appointment.public_code ?? null,
      status: appointment.status ?? null,
      payment_status: appointment.payment_status ?? null,
      requires_online_payment: requiresOnlinePayment,
      starts_at: appointment.starts_at ?? null,
      end_time: appointment.end_time ?? null,
      patient_name: [patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Paciente",
      service_name: service.name ?? appointment.reason ?? "Consulta",
      professional_name: [professional.name, professional.last_name].filter(Boolean).join(" ") || "A confirmar",
      clinic_name: clinic.name ?? "Medin",
      timezone: clinic.timezone ?? "America/Argentina/Mendoza",
      clinic_phone: clinic.phone ?? null,
      location_address: location.address ?? clinic.address ?? null,
      duration_minutes: Number(service.duration_minutes ?? 30),
      has_schedule: Boolean(appointment.starts_at)
    },
    payment:
      requiresOnlinePayment && payment
        ? {
            status: payment.status,
            amount: Number(payment.amount ?? 0),
            currency: payment.currency ?? "ARS",
            paid_at: payment.paid_at ?? null,
            payment_type: service.deposit_required ? "deposit" : "full",
            payment_type_label: service.deposit_required ? "Seña" : "Pago completo",
            remaining_amount: Math.max(expectedAmount - Number(payment.amount ?? 0), 0)
          }
        : null,
    pending_requests: pendingRequests.map((request) => ({
      type: request.type,
      status: request.status,
      created_at: request.created_at
    }))
  };
}

async function handleCalendar(client, res, token) {
  const result = await findAppointmentByToken(client, token);
  if (result.error) return res.status(404).json({ error: result.error });
  const appointment = result.appointment;
  if (!appointment.starts_at) return res.status(422).json({ error: "APPOINTMENT_WITHOUT_SCHEDULE" });

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

async function handleCreateRequest(client, req, res, token) {
  const type = String(req.body?.type ?? "");
  if (!["cancellation", "reschedule"].includes(type)) {
    return res.status(400).json({ error: "INVALID_REQUEST_TYPE" });
  }
  const notes = req.body?.notes ? String(req.body.notes).slice(0, 2000) : null;

  const result = await findAppointmentByToken(client, token);
  if (result.error) return res.status(404).json({ error: result.error });
  const appointment = result.appointment;

  if (INACTIVE_STATUSES.includes(appointment.status)) {
    return res.status(409).json({ error: "APPOINTMENT_NOT_ACTIVE" });
  }

  const { error: insertError } = await client
    .from("appointment_requests")
    .insert({ appointment_id: appointment.id, type, notes, requested_by: "patient" });
  if (insertError) {
    if (insertError.code === "23505") {
      return res.status(409).json({ error: "DUPLICATE_PENDING_REQUEST" });
    }
    throw insertError;
  }

  return res.status(201).json({ ok: true });
}
