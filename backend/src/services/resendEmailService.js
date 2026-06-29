import crypto from "node:crypto";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { supabase } from "../lib/supabase.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const FALLBACK_TEMPLATES = {
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
      "Código: {{public_code}}",
      "",
      "Este turno no requiere pago online. La clínica confirmará las condiciones de atención.",
      "",
      "Ver mi turno: {{appointment_url}}"
    ].join("\n")
  },
  payment_approved_patient: {
    subject: "Pago aprobado y turno registrado",
    body: [
      "Hola {{patient_name}},",
      "",
      "Tu pago fue aprobado y el turno quedó registrado.",
      "",
      "Clínica: {{clinic_name}}",
      "Servicio: {{service_name}}",
      "Profesional: {{professional_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Código: {{public_code}}",
      "",
      "Ver mi turno: {{appointment_url}}"
    ].join("\n")
  },
  reschedule_requested_clinic: {
    subject: "Nueva solicitud de reprogramación",
    body: [
      "Nueva solicitud de reprogramación.",
      "",
      "Paciente: {{patient_name}}",
      "Servicio: {{service_name}}",
      "Turno: {{appointment_datetime}}",
      "Código: {{public_code}}",
      "Notas: {{notes}}",
      "",
      "Gestionar solicitud: {{admin_requests_url}}"
    ].join("\n")
  },
  cancellation_requested_clinic: {
    subject: "Nueva solicitud de cancelación",
    body: [
      "Nueva solicitud de cancelación.",
      "",
      "Paciente: {{patient_name}}",
      "Servicio: {{service_name}}",
      "Turno: {{appointment_datetime}}",
      "Código: {{public_code}}",
      "Notas: {{notes}}",
      "",
      "Gestionar solicitud: {{admin_requests_url}}"
    ].join("\n")
  },
  plan_change_requested_platform: {
    subject: "Nueva solicitud de cambio de plan en Medin",
    body: [
      "Nueva solicitud de cambio de plan en Medin.",
      "",
      "Clínica: {{clinic_name}}",
      "Plan actual: {{current_plan}}",
      "Plan solicitado: {{requested_plan}}",
      "Fecha: {{created_at}}",
      "",
      "Ver solicitudes: {{superadmin_subscriptions_url}}"
    ].join("\n")
  }
};

export async function sendTransactionalEmail({ to, subject, html, text, replyTo, metadata }) {
  if (!config.RESEND_API_KEY) {
    const error = new Error("RESEND_API_KEY no configurada");
    error.code = "RESEND_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.RESEND_FROM_EMAIL,
      reply_to: replyTo || config.RESEND_REPLY_TO_EMAIL || undefined,
      to: [to],
      subject,
      text,
      html,
      tags: buildTags(metadata)
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || body?.error || `Resend respondió ${response.status}`;
    const error = new Error(String(message));
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export async function processPendingEmailDeliveries({ limit = DEFAULT_LIMIT } = {}) {
  const cappedLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  await ensurePlatformEmailDeliveries(cappedLimit);

  const { data: deliveries, error } = await supabase
    .from("notification_deliveries")
    .select(`
      *,
      notification_events(
        *,
        clinics(*),
        patients(*),
        appointments(*, services(*), professionals(*), locations(*)),
        payments(*)
      )
    `)
    .eq("channel", "email")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(cappedLimit);
  if (error) throw error;

  const summary = { processed: 0, sent: 0, failed: 0, skipped: 0, results: [] };
  for (const delivery of deliveries ?? []) {
    summary.processed += 1;
    const result = await processDelivery(delivery);
    summary[result.status] += 1;
    summary.results.push(result);
  }
  return summary;
}

async function processDelivery(delivery) {
  const event = delivery.notification_events;
  if (!event) return markDelivery(delivery.id, "failed", { errorMessage: "Evento asociado no encontrado" });
  if (!delivery.recipient_email) return markDelivery(delivery.id, "skipped", { errorMessage: "Destinatario sin email" });
  if (!config.RESEND_API_KEY) return markDelivery(delivery.id, "skipped", { errorMessage: "RESEND_API_KEY no configurada" });

  try {
    const rendered = await renderDeliveryEmail(delivery, event);
    const sent = await sendTransactionalEmail({
      to: delivery.recipient_email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      metadata: { eventType: event.event_type, deliveryId: delivery.id, clinicId: delivery.clinic_id }
    });
    return markDelivery(delivery.id, "sent", { providerMessageId: sent.id ?? null });
  } catch (error) {
    logger.warn({ err: error, deliveryId: delivery.id, eventType: event.event_type }, "Failed to send notification email with Resend");
    return markDelivery(delivery.id, "failed", { errorMessage: safeErrorMessage(error) });
  }
}

async function renderDeliveryEmail(delivery, event) {
  const variables = await buildVariables(delivery, event);
  const template = await getEmailTemplate(event.event_type);
  const fallback = FALLBACK_TEMPLATES[event.event_type] ?? {
    subject: event.title || "Notificación de Medin",
    body: event.message || "Tenés una nueva notificación de Medin."
  };
  const subject = renderTemplate(template?.title || fallback.subject, variables);
  const text = renderTemplate(template?.body || fallback.body, variables);
  return { subject, text, html: textToHtml(text) };
}

async function getEmailTemplate(key) {
  const { data, error } = await supabase
    .from("notification_templates")
    .select("title, body")
    .eq("key", key)
    .eq("channel", "email")
    .eq("active", true)
    .maybeSingle();
  if (error) {
    logger.warn({ err: error, key }, "Failed to load email notification template");
    return null;
  }
  return data;
}

async function buildVariables(delivery, event) {
  const metadata = event.metadata ?? {};
  const clinic = event.clinics ?? {};
  const patient = event.patients ?? {};
  const appointment = event.appointments ?? {};
  const service = appointment.services ?? {};
  const professional = appointment.professionals ?? {};
  const token = appointment.id ? await ensureAppointmentPublicLink(appointment.id).catch(() => null) : null;
  const publicUrl = resolvePublicUrl();

  return {
    ...metadata,
    clinic_name: metadata.clinic_name ?? clinic.name ?? "Medin",
    patient_name: metadata.patient_name ?? ([patient.first_name, patient.last_name].filter(Boolean).join(" ") || delivery.recipient_name || "Paciente"),
    service_name: metadata.service_name ?? service.name ?? appointment.reason ?? "Turno",
    professional_name: metadata.professional_name ?? ([professional.name, professional.last_name].filter(Boolean).join(" ") || "Profesional a confirmar"),
    appointment_datetime: metadata.appointment_datetime ? formatAppointmentDate(metadata.appointment_datetime, clinic.timezone) : formatAppointmentDate(appointment.starts_at, clinic.timezone),
    public_code: metadata.public_code ?? appointment.public_code ?? "",
    notes: metadata.notes ?? "",
    current_plan: metadata.current_plan ?? "Plan actual",
    requested_plan: metadata.requested_plan ?? "Plan solicitado",
    created_at: formatAppointmentDate(event.created_at, clinic.timezone),
    appointment_url: token ? `${publicUrl}/mi-turno/${token}` : "",
    admin_requests_url: `${publicUrl}/admin/solicitudes`,
    superadmin_subscriptions_url: `${publicUrl}/superadmin/suscripciones`
  };
}

async function ensureAppointmentPublicLink(appointmentId) {
  const { data: existing, error: existingError } = await supabase
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
  const { data, error } = await supabase
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

async function ensurePlatformEmailDeliveries(limit) {
  const platformEmail = config.RESEND_REPLY_TO_EMAIL;
  const { data: events, error } = await supabase
    .from("notification_events")
    .select("id, clinic_id, title, metadata, created_at, notification_deliveries(id, channel, status)")
    .eq("audience", "platform")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    logger.warn({ err: error }, "Failed to inspect platform notification events");
    return;
  }

  for (const event of events ?? []) {
    const hasEmailDelivery = (event.notification_deliveries ?? []).some((item) => item.channel === "email" && ["pending", "sent"].includes(item.status));
    if (hasEmailDelivery) continue;
    await supabase.from("notification_deliveries").insert({
      event_id: event.id,
      clinic_id: event.clinic_id,
      channel: "email",
      recipient_type: "platform_user",
      recipient_name: "Medin",
      recipient_email: platformEmail ?? null,
      status: platformEmail ? "pending" : "skipped",
      provider: "resend",
      error_message: platformEmail ? null : "Destinatario sin email",
      metadata: event.metadata ?? {}
    });
  }
}

async function markDelivery(id, status, { providerMessageId = null, errorMessage = null } = {}) {
  const payload = {
    status,
    provider: "resend",
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    sent_at: status === "sent" ? new Date().toISOString() : null
  };
  const { error } = await supabase.from("notification_deliveries").update(payload).eq("id", id);
  if (error) throw error;
  return { id, status, error: errorMessage, providerMessageId };
}

const INVITATION_ROLE_LABELS = {
  clinic_admin: "Administrador de clínica",
  receptionist: "Recepción",
  professional: "Profesional"
};

export async function sendInvitationEmail({ to, fullName, clinicName, role, invitationUrl, expiresAt }) {
  const roleLabel = INVITATION_ROLE_LABELS[role] ?? role;
  const subject = "Te invitaron a Medin";
  const text = [
    `Hola ${fullName},`,
    "",
    `Te invitaron a formar parte de ${clinicName} en Medin.`,
    "",
    `Tu rol asignado es: ${roleLabel}.`,
    "",
    "Desde tu cuenta vas a poder acceder a las herramientas habilitadas para tu perfil y colaborar en la gestión de turnos, pacientes y servicios de la clínica.",
    "",
    "Para comenzar, aceptá la invitación y creá tu acceso.",
    "",
    `Aceptar invitación: ${invitationUrl}`,
    "",
    "Si no esperabas esta invitación, podés ignorar este mensaje."
  ].join("\n");
  const preheader = "Accedé a la cuenta de tu clínica y empezá a gestionar turnos, pacientes y servicios.";
  const expiresLabel = formatAppointmentDate(expiresAt);
  const html = `<!doctype html>
<html lang="es-AR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Te invitaron a Medin</title></head>
  <body style="margin:0;padding:0;background:#F6FAF9;font-family:Inter,Arial,sans-serif;color:#0D3642;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6FAF9;margin:0;padding:32px 16px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
      <tr><td style="padding:0 0 20px 0;"><div style="font-size:28px;line-height:1;font-weight:700;color:#0D3642;"><span style="display:inline-block;width:34px;height:34px;border:3px solid #8FD2C6;border-top-color:#0D3642;border-radius:50%;vertical-align:middle;margin-right:10px;text-align:center;line-height:28px;color:#8FD2C6;font-weight:700;">+</span>Medin</div><div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#5CAFA4;margin-top:10px;">Healthcare Technology</div></td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #DCE9E6;border-radius:24px;padding:34px 32px;box-shadow:0 18px 42px rgba(13,54,66,0.08);">
        <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.2;color:#0D3642;">Te invitaron a Medin</h1>
        <p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#526578;">Hola ${escapeHtml(fullName)},</p>
        <p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:#526578;">Te invitaron a formar parte de <strong>${escapeHtml(clinicName)}</strong> en Medin.</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F6FAF9;border:1px solid #DCE9E6;border-radius:18px;margin:0 0 22px 0;"><tr><td style="padding:18px 20px;font-size:14px;line-height:1.7;color:#0D3642;">Clínica: ${escapeHtml(clinicName)}<br>Rol asignado: ${escapeHtml(roleLabel)}<br>Vencimiento de la invitación: ${escapeHtml(expiresLabel)}</td></tr></table>
        <p style="margin:0 0 24px 0;font-size:16px;line-height:1.65;color:#526578;">Desde tu cuenta vas a poder acceder a las herramientas habilitadas para tu perfil y colaborar en la gestión de turnos, pacientes y servicios de la clínica.</p>
        <p style="margin:0 0 26px 0;font-size:16px;line-height:1.65;color:#526578;">Para comenzar, aceptá la invitación y creá tu acceso.</p>
        <div><a href="${escapeHtml(invitationUrl)}" style="display:inline-block;background:#0D3642;color:#FFFFFF;text-decoration:none;border-radius:14px;padding:14px 22px;font-size:15px;font-weight:700;">Aceptar invitación</a></div>
        <p style="margin:26px 0 0 0;font-size:13px;line-height:1.6;color:#718092;">Si no esperabas esta invitación, podés ignorar este mensaje.</p>
      </td></tr>
      <tr><td style="padding:22px 8px 0 8px;text-align:center;font-size:12px;line-height:1.6;color:#7A8A98;">Este es un email transaccional de Medin.</td></tr>
    </table></td></tr></table>
  </body>
</html>`;
  return sendTransactionalEmail({
    to,
    subject,
    text,
    html,
    metadata: { eventType: "clinic_user_invitation" }
  });
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

function resolvePublicUrl() {
  return (config.APP_PUBLIC_URL || "https://clinic-saas-mvp.vercel.app").replace(/\/$/, "");
}

function safeErrorMessage(error) {
  if (error?.code === "RESEND_NOT_CONFIGURED") return "RESEND_API_KEY no configurada";
  if (error?.statusCode) return `Resend respondió ${error.statusCode}: ${error.message}`;
  return error instanceof Error ? error.message : "No pudimos enviar el email con Resend.";
}

function buildTags(metadata = {}) {
  return Object.entries(metadata)
    .filter(([key, value]) => ["eventType", "deliveryId", "clinicId"].includes(key) && value)
    .map(([name, value]) => ({ name, value: String(value).slice(0, 256) }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
