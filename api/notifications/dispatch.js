import crypto from "node:crypto";
import { makeSupabase } from "../_lib/supabase.js";
import { allowOnly, handleError } from "../_lib/http.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;

// Se llama justo despues de crear un turno (reserva publica o carga manual
// desde la Agenda) para procesar en el momento las notification_deliveries
// de canal email que el trigger de la base ya dejo en 'pending'. No recibe
// contenido del cliente - solo procesa filas que ya existian, asi que no
// hace falta autenticacion para poder llamarse tanto desde la pagina
// publica de reservas como desde el panel admin.
const FALLBACK_TEMPLATES = {
  new_booking_clinic: {
    subject: "Nueva reserva: {{patient_name}}",
    body: [
      "Se registro una nueva reserva.",
      "",
      "Paciente: {{patient_name}}",
      "Servicio: {{service_name}}",
      "Profesional: {{professional_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Codigo: {{public_code}}"
    ].join("\n")
  },
  new_booking_professional: {
    subject: "Nuevo turno asignado: {{appointment_datetime}}",
    body: [
      "Hola {{professional_name}},",
      "",
      "Se te asigno un nuevo turno.",
      "",
      "Paciente: {{patient_name}}",
      "Servicio: {{service_name}}",
      "Clinica: {{clinic_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Codigo: {{public_code}}"
    ].join("\n")
  },
  appointment_created_patient: {
    subject: "Tu turno en {{clinic_name}}",
    body: [
      "Hola {{patient_name}},",
      "",
      "Tu turno quedo registrado en {{clinic_name}}.",
      "",
      "Servicio: {{service_name}}",
      "Profesional: {{professional_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Codigo: {{public_code}}",
      "",
      "Ver mi turno: {{appointment_url}}"
    ].join("\n")
  },
  appointment_no_payment_patient: {
    subject: "Tu turno fue registrado en {{clinic_name}}",
    body: [
      "Hola {{patient_name}},",
      "",
      "Tu turno fue registrado en {{clinic_name}}.",
      "",
      "Servicio: {{service_name}}",
      "Profesional: {{professional_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Codigo: {{public_code}}",
      "",
      "Este turno no requiere pago online. La clinica confirmara las condiciones de atencion.",
      "",
      "Ver mi turno: {{appointment_url}}"
    ].join("\n")
  },
  payment_approved_patient: {
    subject: "Pago aprobado y turno registrado",
    body: [
      "Hola {{patient_name}},",
      "",
      "Tu pago fue aprobado y el turno quedo registrado.",
      "",
      "Clinica: {{clinic_name}}",
      "Servicio: {{service_name}}",
      "Profesional: {{professional_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Codigo: {{public_code}}",
      "",
      "Ver mi turno: {{appointment_url}}"
    ].join("\n")
  },
  reschedule_requested_clinic: {
    subject: "Nueva solicitud de reprogramacion",
    body: [
      "Nueva solicitud de reprogramacion.",
      "",
      "Paciente: {{patient_name}}",
      "Servicio: {{service_name}}",
      "Turno: {{appointment_datetime}}",
      "Codigo: {{public_code}}",
      "Notas: {{notes}}",
      "",
      "Gestionar solicitud: {{admin_requests_url}}"
    ].join("\n")
  },
  cancellation_requested_clinic: {
    subject: "Nueva solicitud de cancelacion",
    body: [
      "Nueva solicitud de cancelacion.",
      "",
      "Paciente: {{patient_name}}",
      "Servicio: {{service_name}}",
      "Turno: {{appointment_datetime}}",
      "Codigo: {{public_code}}",
      "Notas: {{notes}}",
      "",
      "Gestionar solicitud: {{admin_requests_url}}"
    ].join("\n")
  }
};

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["POST"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    const appointmentId = req.body?.appointment_id ?? null;
    const limit = Math.min(Math.max(Number(req.body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const summary = await processPendingEmailDeliveries(client, { appointmentId, limit });
    return res.status(200).json(summary);
  } catch (err) {
    return handleError(res, err);
  }
}

async function processPendingEmailDeliveries(client, { appointmentId, limit }) {
  let query = client
    .from("notification_deliveries")
    .select(`
      *,
      notification_events(
        *,
        clinics(*),
        patients(*),
        professionals(*),
        appointments(*, services(*), professionals(*), locations(*))
      )
    `)
    .eq("channel", "email")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (appointmentId) query = query.eq("notification_events.appointment_id", appointmentId);

  const { data: deliveries, error } = await query;
  if (error) throw error;

  const relevant = appointmentId
    ? (deliveries ?? []).filter((row) => row.notification_events?.appointment_id === appointmentId)
    : deliveries ?? [];

  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0 };
  for (const delivery of relevant) {
    summary.processed += 1;
    const result = await processDelivery(client, delivery);
    summary[result.status] += 1;
  }
  return summary;
}

async function processDelivery(client, delivery) {
  const event = delivery.notification_events;
  if (!event) return markDelivery(client, delivery.id, "failed", { errorMessage: "Evento asociado no encontrado" });
  if (!delivery.recipient_email) return markDelivery(client, delivery.id, "skipped", { errorMessage: "Destinatario sin email" });
  if (!process.env.RESEND_API_KEY) return markDelivery(client, delivery.id, "skipped", { errorMessage: "RESEND_API_KEY no configurada" });

  try {
    const rendered = await renderDeliveryEmail(client, delivery, event);
    const sent = await sendTransactionalEmail({
      to: delivery.recipient_email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html
    });
    return markDelivery(client, delivery.id, "sent", { providerMessageId: sent.id ?? null });
  } catch (err) {
    console.error("Failed to send notification email with Resend", err);
    return markDelivery(client, delivery.id, "failed", { errorMessage: safeErrorMessage(err) });
  }
}

async function sendTransactionalEmail({ to, subject, html, text }) {
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL,
      reply_to: process.env.RESEND_REPLY_TO_EMAIL || undefined,
      to: [to],
      subject,
      text,
      html
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || body?.error || `Resend respondió ${response.status}`;
    const err = new Error(String(message));
    err.statusCode = response.status;
    throw err;
  }
  return body;
}

async function renderDeliveryEmail(client, delivery, event) {
  const variables = await buildVariables(client, delivery, event);
  const fallback = FALLBACK_TEMPLATES[event.event_type] ?? {
    subject: event.title || "Notificación de Medin",
    body: event.message || "Tenés una nueva notificación de Medin."
  };
  const subject = renderTemplate(fallback.subject, variables);
  const text = renderTemplate(fallback.body, variables);
  return { subject, text, html: textToHtml(text) };
}

async function buildVariables(client, delivery, event) {
  const metadata = event.metadata ?? {};
  const clinic = event.clinics ?? {};
  const patient = event.patients ?? {};
  const professional = event.professionals ?? event.appointments?.professionals ?? {};
  const appointment = event.appointments ?? {};
  const service = appointment.services ?? {};
  const token = appointment.id ? await ensureAppointmentPublicLink(client, appointment.id).catch(() => null) : null;
  const publicUrl = (process.env.APP_PUBLIC_URL || "https://app.medin.com.ar").replace(/\/$/, "");

  return {
    ...metadata,
    clinic_name: metadata.clinic_name ?? clinic.name ?? "Medin",
    patient_name: metadata.patient_name ?? ([patient.first_name, patient.last_name].filter(Boolean).join(" ") || delivery.recipient_name || "Paciente"),
    professional_name: metadata.professional_name ?? ([professional.name, professional.last_name].filter(Boolean).join(" ") || "Profesional a confirmar"),
    service_name: metadata.service_name ?? service.name ?? appointment.reason ?? "Turno",
    appointment_datetime: metadata.appointment_datetime ? formatAppointmentDate(metadata.appointment_datetime, clinic.timezone) : formatAppointmentDate(appointment.starts_at, clinic.timezone),
    public_code: metadata.public_code ?? appointment.public_code ?? "",
    notes: metadata.notes ?? "",
    appointment_url: token ? `${publicUrl}/mi-turno/${token}` : "",
    admin_requests_url: `${publicUrl}/admin/solicitudes`
  };
}

async function ensureAppointmentPublicLink(client, appointmentId) {
  const { data: existing, error: existingError } = await client
    .from("appointment_public_links")
    .select("token, expires_at, revoked_at")
    .eq("appointment_id", appointmentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) return existing.token;

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

async function markDelivery(client, id, status, { providerMessageId = null, errorMessage = null } = {}) {
  const payload = {
    status,
    provider: "resend",
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    sent_at: status === "sent" ? new Date().toISOString() : null
  };
  const { error } = await client.from("notification_deliveries").update(payload).eq("id", id);
  if (error) throw error;
  return { id, status };
}

function renderTemplate(template, variables) {
  return Object.entries(variables).reduce((content, [key, value]) => {
    return content.split(`{{${key}}}`).join(value == null ? "" : String(value));
  }, template ?? "");
}

function textToHtml(text) {
  return `<div style="font-family:Inter,Arial,sans-serif;color:#0D3642;line-height:1.6;font-size:15px">${escapeHtml(text)
    .split("\n\n")
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}

function formatAppointmentDate(value, timezone = "America/Argentina/Mendoza") {
  if (!value) return "A confirmar";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone || "America/Argentina/Mendoza"
  }).format(new Date(value));
}

function safeErrorMessage(error) {
  if (error?.statusCode) return `Resend respondió ${error.statusCode}: ${error.message}`;
  return error instanceof Error ? error.message : "No pudimos enviar el email con Resend.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
