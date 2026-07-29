import crypto from "node:crypto";
import { makeSupabase } from "../_lib/supabase.js";
import { allowOnly, handleError } from "../_lib/http.js";
import {
  EVENT_TYPE_TO_TEMPLATE_KEY,
  WHATSAPP_TEMPLATE_DEFINITIONS,
  buildTemplateParams,
  connectClinicWhatsApp,
  getClinicWhatsAppAccessToken,
  getClinicWhatsAppSender,
  sendWhatsAppMessage,
  submitWhatsAppTemplate
} from "../_lib/whatsappAccount.js";

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
  },
  // Fallback por email de los recordatorios - la via principal es WhatsApp,
  // pero clinic_notification_settings.email_enabled puede seguir sumando
  // una delivery de canal email para el mismo evento (mismo patron que el
  // resto de los eventos, no son mutuamente excluyentes).
  appointment_reminder_24h: {
    subject: "Recordatorio: tu turno es manana",
    body: [
      "Hola {{patient_name}},",
      "",
      "Te recordamos tu turno para manana en {{clinic_name}}.",
      "",
      "Servicio: {{service_name}}",
      "Profesional: {{professional_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Codigo: {{public_code}}",
      "",
      "Ver mi turno: {{appointment_url}}"
    ].join("\n")
  },
  appointment_reminder_2h: {
    subject: "Recordatorio: tu turno es hoy",
    body: [
      "Hola {{patient_name}},",
      "",
      "Tu turno en {{clinic_name}} es hoy.",
      "",
      "Servicio: {{service_name}}",
      "Profesional: {{professional_name}}",
      "Fecha y hora: {{appointment_datetime}}",
      "Codigo: {{public_code}}",
      "",
      "Ver mi turno: {{appointment_url}}"
    ].join("\n")
  }
};

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET", "POST"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    // Vercel Cron solo hace GET - unico caso que acepta ese metodo aca,
    // protegido con CRON_SECRET (Vercel manda ese Authorization solo si
    // la env var existe con ese nombre exacto).
    if (req.method === "GET") {
      if (req.query?.type !== "reminders_sweep") return res.status(404).json({ error: "NOT_FOUND" });
      if (!isCronAuthorized(req)) return res.status(401).json({ error: "UNAUTHORIZED" });
      const summary = await runRemindersSweep(client);
      return res.status(200).json(summary);
    }

    // Boton global de "Necesitas ayuda?" (HelpWidget) - comparte este
    // archivo en vez de sumar una funcion serverless nueva (Vercel Hobby
    // ya esta en el tope de 12, se vio fallar el deploy real por esto).
    if (req.body?.type === "support_ticket") {
      return await handleSupportTicket(client, req, res);
    }
    if (req.body?.type === "whatsapp_connect") {
      return await handleWhatsAppConnect(client, req, res);
    }
    if (req.body?.type === "user_invitation") {
      return await handleUserInvitation(client, req, res);
    }
    const appointmentId = req.body?.appointment_id ?? null;
    const limit = Math.min(Math.max(Number(req.body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const summary = await processPendingDeliveries(client, { appointmentId, limit });
    return res.status(200).json(summary);
  } catch (err) {
    return handleError(res, err);
  }
}

function isCronAuthorized(req) {
  const header = req.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(process.env.CRON_SECRET) && token === process.env.CRON_SECRET;
}

async function handleSupportTicket(client, req, res) {
  const auth = await authenticate(client, req);
  if (!auth) return res.status(401).json({ error: "UNAUTHORIZED" });

  const subject = String(req.body?.subject ?? "").trim();
  const message = String(req.body?.message ?? "").trim();
  if (!subject || !message) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  const { data: ticket, error: insertError } = await client
    .from("support_tickets")
    .insert({ clinic_id: auth.clinicId, created_by: auth.userId, role: auth.role, subject, message })
    .select("id")
    .single();
  if (insertError) throw insertError;

  if (process.env.RESEND_API_KEY && process.env.SUPPORT_NOTIFICATION_EMAIL) {
    const text = `Rol: ${auth.role ?? "desconocido"}\nClinica: ${auth.clinicId ?? "sin clinica"}\n\n${message}`;
    await sendTransactionalEmail({
      to: process.env.SUPPORT_NOTIFICATION_EMAIL,
      subject: `Nuevo ticket de soporte: ${subject}`,
      text,
      html: textToHtml(text)
    }).catch((err) => console.error("Failed to email support ticket", err));
  }

  return res.status(200).json({ ok: true, id: ticket.id });
}

// El mail de invitacion de usuario se manda desde aca en vez de un endpoint
// nuevo (mismo motivo que support_ticket/whatsapp_connect - tope de 12
// funciones en Vercel Hobby). Antes esto le pegaba a /api/messages/send,
// que nunca existio - la invitacion se guardaba en la base pero el mail
// jamas salia, 404 silencioso tragado por el frontend.
async function handleUserInvitation(client, req, res) {
  const auth = await authenticate(client, req);
  if (!auth) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!["platform_admin", "clinic_admin", "admin"].includes(auth.role)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  const invitationId = String(req.body?.invitation_id ?? "");
  if (!invitationId) return res.status(400).json({ error: "MISSING_FIELDS" });

  const { data: invitation, error: invitationError } = await client
    .from("user_invitations")
    .select("id, clinic_id, email, full_name, role, invitation_token, invited_by, clinics(name)")
    .eq("id", invitationId)
    .maybeSingle();
  if (invitationError) throw invitationError;
  if (!invitation) return res.status(404).json({ error: "INVITATION_NOT_FOUND" });
  if (auth.role !== "platform_admin" && invitation.clinic_id !== auth.clinicId) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  if (!invitation.invitation_token) return res.status(200).json({ ok: true, sent: false });

  if (!process.env.RESEND_API_KEY) return res.status(200).json({ ok: true, sent: false });

  let inviterName = null;
  if (invitation.invited_by) {
    const { data: inviterProfile } = await client.from("profiles").select("full_name").eq("id", invitation.invited_by).maybeSingle();
    inviterName = inviterProfile?.full_name ?? null;
  }

  const publicUrl = (process.env.APP_PUBLIC_URL || "https://app.medin.com.ar").replace(/\/$/, "");
  const invitationUrl = `${publicUrl}/invitacion/${invitation.invitation_token}`;
  const clinicName = invitation.clinics?.name ?? "Medin";
  const firstName = (invitation.full_name || "").trim().split(/\s+/)[0] || "";
  const text = [
    `Hola ${firstName},`,
    "",
    `${inviterName ?? clinicName} te invitó a sumarte a su espacio de trabajo en Medin.`,
    "",
    `Activá tu cuenta para acceder a la plataforma y comenzar a gestionar tu perfil: ${invitationUrl}`
  ].join("\n");

  try {
    await sendTransactionalEmail({
      to: invitation.email,
      subject: "Te invitaron a Medin",
      text,
      html: renderInvitationEmailHtml({ firstName, inviterName: inviterName ?? clinicName, invitationUrl })
    });
    return res.status(200).json({ ok: true, sent: true });
  } catch (err) {
    console.error("Failed to email user invitation", err);
    return res.status(200).json({ ok: true, sent: false });
  }
}

function renderInvitationEmailHtml({ firstName, inviterName, invitationUrl }) {
  const safeFirstName = escapeHtml(firstName);
  const safeInviterName = escapeHtml(inviterName);
  const safeUrl = escapeHtml(invitationUrl);
  return `
<div style="background:#F1F7F6;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#0D3642">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;padding:40px;border:1px solid #E1EEEC">
    <table cellpadding="0" cellspacing="0" role="presentation"><tr>
      <td style="width:44px;height:44px;border-radius:999px;border:2px solid #0D766E;text-align:center;vertical-align:middle;font-size:22px;font-weight:700;color:#0D766E">+</td>
      <td style="padding-left:12px;vertical-align:middle">
        <div style="font-size:19px;font-weight:700;color:#0D3642;line-height:1.2">Medin</div>
        <div style="font-size:11px;font-weight:600;letter-spacing:0.12em;color:#54AAA0;text-transform:uppercase">Gestión clínica</div>
      </td>
    </tr></table>
    <hr style="border:none;border-top:1px solid #E1EEEC;margin:24px 0" />
    <h1 style="font-size:26px;margin:0 0 20px;color:#0D3642">Te invitaron a Medin</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Hola ${safeFirstName},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 16px"><strong style="color:#0D766E">${safeInviterName}</strong> te invitó a sumarte a su espacio de trabajo en Medin.</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 28px">Activá tu cuenta para acceder a la plataforma y comenzar a gestionar tu perfil.</p>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto 28px"><tr>
      <td style="border-radius:12px;background:#0D766E">
        <a href="${safeUrl}" style="display:inline-block;padding:16px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">Activar cuenta</a>
      </td>
    </tr></table>
    <hr style="border:none;border-top:1px solid #E1EEEC;margin:24px 0" />
    <p style="font-size:14px;color:#5B7D79;margin:0 0 12px">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
    <div style="background:#F6FAF9;border:1px solid #E1EEEC;border-radius:10px;padding:14px;font-size:13px;color:#0D766E;word-break:break-all;margin:0 0 20px">${safeUrl}</div>
    <div style="background:#F1F9F6;border:1px solid #D3ECE4;border-radius:12px;padding:16px;font-size:13px;line-height:1.5;color:#0D3642;margin:0 0 24px">
      🛡️ Este enlace es personal y tiene una vigencia limitada. Si no esperabas esta invitación, podés ignorar este email.
    </div>
    <hr style="border:none;border-top:1px solid #E1EEEC;margin:0 0 16px" />
    <p style="font-size:12px;color:#8AA3A0;margin:0">Este es un email automático de Medin. Por seguridad, no compartas este enlace.</p>
  </div>
</div>`.trim();
}

async function handleWhatsAppConnect(client, req, res) {
  const auth = await authenticate(client, req);
  if (!auth) return res.status(401).json({ error: "UNAUTHORIZED" });
  if (!["platform_admin", "clinic_admin", "admin"].includes(auth.role)) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }
  if (!auth.clinicId) return res.status(400).json({ error: "NO_CLINIC" });

  const code = String(req.body?.code ?? "");
  const wabaId = String(req.body?.waba_id ?? "");
  const phoneNumberId = String(req.body?.phone_number_id ?? "");
  if (!code || !wabaId || !phoneNumberId) {
    return res.status(400).json({ error: "MISSING_FIELDS" });
  }

  try {
    const settings = await connectClinicWhatsApp(client, { clinicId: auth.clinicId, code, wabaId, phoneNumberId });

    // Las 3 plantillas estandar se mandan a aprobar solas apenas se
    // conecta - si alguna falla (ej. ya existia de un intento anterior),
    // no aborta la conexion, solo se loguea.
    const accessToken = await getClinicWhatsAppAccessToken(client, auth.clinicId);
    for (const templateKey of Object.keys(WHATSAPP_TEMPLATE_DEFINITIONS)) {
      await submitWhatsAppTemplate(client, { clinicId: auth.clinicId, wabaId, accessToken, templateKey }).catch((err) =>
        console.error(`Failed to submit whatsapp template ${templateKey}`, err?.metaResponse ?? err)
      );
    }

    return res.status(200).json({ ok: true, settings });
  } catch (err) {
    return res.status(err?.statusCode ?? 502).json({
      error: "WHATSAPP_CONNECT_FAILED",
      message: "No pudimos conectar WhatsApp. Probá de nuevo.",
      detail: err?.metaResponse ?? null
    });
  }
}

// Dispara desde vercel.json (crons, cada 15 min) via GET con
// ?type=reminders_sweep. Barre dos ventanas (24h y 2h antes del turno) y
// encola un notification_event por turno que caiga adentro, una sola vez
// (columnas reminder_24h_sent_at/reminder_2h_sent_at de la migracion 050).
// La ventana de busqueda (30 min) es mas ancha que el intervalo del cron (15
// min) a proposito, para no perder turnos si una corrida se atrasa o falla.
async function runRemindersSweep(client) {
  const windowMinutes = 30;
  const results24h = await sweepReminderWindow(client, {
    hoursBefore: 24,
    sentAtColumn: "reminder_24h_sent_at",
    eventType: "appointment_reminder_24h",
    windowMinutes
  });
  const results2h = await sweepReminderWindow(client, {
    hoursBefore: 2,
    sentAtColumn: "reminder_2h_sent_at",
    eventType: "appointment_reminder_2h",
    windowMinutes
  });
  return { reminder_24h: results24h, reminder_2h: results2h };
}

async function sweepReminderWindow(client, { hoursBefore, sentAtColumn, eventType, windowMinutes }) {
  const enabledColumn = hoursBefore === 24 ? "reminder_24h_enabled" : "reminder_2h_enabled";
  const { data: settingsRows, error: settingsError } = await client
    .from("clinic_notification_settings")
    .select("clinic_id")
    .eq(enabledColumn, true);
  if (settingsError) throw settingsError;

  const clinicIds = (settingsRows ?? []).map((row) => row.clinic_id);
  const summary = { candidates: 0, enqueued: 0, failed: 0 };
  if (clinicIds.length === 0) return summary;

  const windowStart = new Date(Date.now() + hoursBefore * 60 * 60 * 1000);
  const windowEnd = new Date(windowStart.getTime() + windowMinutes * 60 * 1000);

  const { data: appointments, error: appointmentsError } = await client
    .from("appointments")
    .select("id, clinic_id, patient_id, professional_id, starts_at, public_code, reason, services(name), clinics(name), patients(first_name, last_name), professionals(name, last_name)")
    .in("clinic_id", clinicIds)
    .in("status", ["pending", "confirmed"])
    .is(sentAtColumn, null)
    .gte("starts_at", windowStart.toISOString())
    .lt("starts_at", windowEnd.toISOString());
  if (appointmentsError) throw appointmentsError;

  summary.candidates = appointments?.length ?? 0;
  for (const appointment of appointments ?? []) {
    try {
      const metadata = {
        service_name: appointment.services?.name ?? appointment.reason ?? "Turno",
        clinic_name: appointment.clinics?.name ?? "Medin",
        patient_name: [appointment.patients?.first_name, appointment.patients?.last_name].filter(Boolean).join(" "),
        professional_name: [appointment.professionals?.name, appointment.professionals?.last_name].filter(Boolean).join(" "),
        appointment_datetime: appointment.starts_at ?? "",
        public_code: appointment.public_code ?? ""
      };
      const { error: rpcError } = await client.rpc("enqueue_notification_event", {
        p_event_type: eventType,
        p_audience: "patient",
        p_clinic_id: appointment.clinic_id,
        p_patient_id: appointment.patient_id,
        p_appointment_id: appointment.id,
        p_metadata: metadata
      });
      if (rpcError) throw rpcError;

      const { error: updateError } = await client
        .from("appointments")
        .update({ [sentAtColumn]: new Date().toISOString() })
        .eq("id", appointment.id);
      if (updateError) throw updateError;

      summary.enqueued += 1;
    } catch (err) {
      console.error(`Failed to enqueue ${eventType} for appointment ${appointment.id}`, err);
      summary.failed += 1;
    }
  }
  return summary;
}

async function authenticate(client, req) {
  const header = req.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: member, error: memberError } = await client
    .from("clinic_members")
    .select("clinic_id, role")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  return { userId: data.user.id, clinicId: member?.clinic_id ?? null, role: member?.role ?? null };
}

async function processPendingDeliveries(client, { appointmentId, limit }) {
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
    .in("channel", ["email", "whatsapp"])
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
    const result = delivery.channel === "whatsapp" ? await processWhatsAppDelivery(client, delivery) : await processDelivery(client, delivery);
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
    return markDelivery(client, delivery.id, "sent", { provider: "resend", providerMessageId: sent.id ?? null });
  } catch (err) {
    console.error("Failed to send notification email with Resend", err);
    return markDelivery(client, delivery.id, "failed", { provider: "resend", errorMessage: safeErrorMessage(err) });
  }
}

// Las deliveries de canal whatsapp ya vienen filtradas en 'pending' por
// enqueue_notification_event() (solo si whatsapp_enabled y hay telefono) -
// aca solo falta que la clinica tenga un numero CONECTADO (Embedded Signup,
// Parte C) y que el evento tenga una plantilla asociada (Parte D).
async function processWhatsAppDelivery(client, delivery) {
  const event = delivery.notification_events;
  if (!event) return markDelivery(client, delivery.id, "failed", { errorMessage: "Evento asociado no encontrado" });
  if (!delivery.recipient_phone) return markDelivery(client, delivery.id, "skipped", { errorMessage: "Destinatario sin telefono" });

  const templateKey = EVENT_TYPE_TO_TEMPLATE_KEY[event.event_type];
  if (!templateKey) return markDelivery(client, delivery.id, "skipped", { errorMessage: `Sin plantilla de WhatsApp para ${event.event_type}` });

  const sender = await getClinicWhatsAppSender(client, event.clinic_id);
  if (!sender) return markDelivery(client, delivery.id, "skipped", { errorMessage: "La clinica no tiene un numero de WhatsApp conectado" });

  try {
    const params = buildTemplateParams(event.metadata ?? {});
    const sent = await sendWhatsAppMessage({
      phoneNumberId: sender.phoneNumberId,
      accessToken: sender.accessToken,
      to: normalizeWhatsAppPhone(delivery.recipient_phone),
      templateKey,
      params
    });
    const messageId = sent?.messages?.[0]?.id ?? null;
    return markDelivery(client, delivery.id, "sent", { provider: "meta", providerMessageId: messageId });
  } catch (err) {
    console.error("Failed to send WhatsApp message", err?.metaResponse ?? err);
    return markDelivery(client, delivery.id, "failed", { provider: "meta", errorMessage: err?.metaResponse?.error?.message ?? safeErrorMessage(err) });
  }
}

// Meta exige el numero en formato E.164 sin "+" ni separadores - los
// telefonos guardados en patients/clinics vienen con formato libre (a veces
// con espacios, guiones o el "+" inicial).
function normalizeWhatsAppPhone(rawPhone) {
  return String(rawPhone).replace(/[^\d]/g, "");
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

async function markDelivery(client, id, status, { provider = null, providerMessageId = null, errorMessage = null } = {}) {
  const payload = {
    status,
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    sent_at: status === "sent" ? new Date().toISOString() : null
  };
  if (provider) payload.provider = provider;
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
