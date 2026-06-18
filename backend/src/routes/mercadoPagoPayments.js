import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";
import { assertPermission } from "../security/permissions.js";

export const mercadoPagoPaymentsRouter = Router();

const createPreferenceSchema = z.object({
  appointmentId: z.string().uuid(),
  amountType: z.enum(["deposit", "full"]).default("deposit")
});

mercadoPagoPaymentsRouter.post("/payments/mercadopago/create-preference", async (req, res, next) => {
  try {
    const missingConfiguration = getCreatePreferenceConfigError();
    if (missingConfiguration) {
      return res.status(503).json({ error: missingConfiguration });
    }
    const payload = createPreferenceSchema.parse(req.body);
    const auth = await authenticateOptional(req);
    if (auth?.role) assertPermission(auth.role, "canManageBilling");

    const appointment = await loadAppointment(payload.appointmentId);
    if (!appointment) return res.status(404).json({ error: "APPOINTMENT_NOT_FOUND" });
    if (auth?.clinicId && auth.role !== "platform_admin" && auth.clinicId !== appointment.clinic_id) {
      return res.status(403).json({ error: "FORBIDDEN_CLINIC" });
    }
    if (!auth && !isPublicPaymentAllowed(appointment)) {
      return res.status(403).json({ error: "PUBLIC_PAYMENT_NOT_ALLOWED" });
    }

    const amount = resolveAmount(appointment, payload.amountType);
    if (!amount || amount <= 0) return res.status(400).json({ error: "INVALID_AMOUNT" });

    const payment = await createInternalPayment({ appointment, amount, amountType: payload.amountType });
    const preference = await createMercadoPagoPreference({ appointment, payment, amount });

    await supabase
      .from("payments")
      .update({
        provider_preference_id: preference.id,
        checkout_url: preference.init_point ?? preference.sandbox_init_point ?? null,
        updated_at: new Date().toISOString()
      })
      .eq("id", payment.id);

    await supabase
      .from("appointments")
      .update({
        payment_required: true,
        payment_status: payload.amountType === "deposit" ? "deposit_pending" : "unpaid",
        deposit_amount: payload.amountType === "deposit" ? amount : appointment.deposit_amount
      })
      .eq("id", appointment.id);

    res.status(200).json({
      payment_id: payment.id,
      checkout_url: preference.init_point ?? preference.sandbox_init_point,
      provider_preference_id: preference.id,
      external_reference: payment.external_reference
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_PAYLOAD" });
    next(error);
  }
});

mercadoPagoPaymentsRouter.get("/payments/mercadopago/status", async (req, res, next) => {
  try {
    let payment = await resolvePaymentFromRequest(req.query);
    const providerPaymentIdFromQuery = resolveProviderPaymentId(req.query, null);
    let providerPayment = null;
    if (!payment && providerPaymentIdFromQuery && config.MERCADO_PAGO_ACCESS_TOKEN) {
      providerPayment = await fetchMercadoPagoPayment(providerPaymentIdFromQuery);
      payment = await findPayment(providerPayment, providerPaymentIdFromQuery);
    }
    if (!payment) return res.status(404).json({ error: "PAYMENT_NOT_FOUND" });

    const providerPaymentId = resolveProviderPaymentId(req.query, payment);
    if (providerPaymentId && config.MERCADO_PAGO_ACCESS_TOKEN) {
      providerPayment = providerPayment?.id && String(providerPayment.id) === String(providerPaymentId) ? providerPayment : await fetchMercadoPagoPayment(providerPaymentId);
      await updatePaymentFromProvider(payment, providerPayment);
    }

    const updatedPayment = await loadPaymentDetails(payment.id);
    if (!updatedPayment) return res.status(404).json({ error: "PAYMENT_NOT_FOUND" });
    if (updatedPayment.status === "approved") {
      await sendPaymentApprovedNotifications(updatedPayment);
    }

    res.status(200).json(toPaymentStatusResponse(updatedPayment));
  } catch (error) {
    next(error);
  }
});

mercadoPagoPaymentsRouter.get("/appointments/:id/calendar.ics", async (req, res, next) => {
  try {
    const appointmentId = String(req.params.id ?? "");
    if (!isUuid(appointmentId)) return res.status(400).json({ error: "INVALID_APPOINTMENT_ID" });
    const appointment = await loadAppointmentDetails(appointmentId);
    if (!appointment) return res.status(404).json({ error: "APPOINTMENT_NOT_FOUND" });
    const ics = buildIcsEvent(appointment);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="turno-medin-${appointment.id}.ics"`);
    res.status(200).send(ics);
  } catch (error) {
    next(error);
  }
});

mercadoPagoPaymentsRouter.post("/payments/mercadopago/webhook", async (req, res, next) => {
  try {
    if (!verifyWebhook(req)) return res.status(401).json({ error: "INVALID_SIGNATURE" });
    const providerEventId = String(req.body?.id ?? req.query?.id ?? req.body?.data?.id ?? crypto.randomUUID());
    const eventType = String(req.body?.type ?? req.body?.action ?? "payment.updated");
    const providerPaymentId = String(req.body?.data?.id ?? req.query?.["data.id"] ?? req.body?.id ?? "");

    const existingEvent = await supabase
      .from("payment_events")
      .select("id")
      .eq("provider", "mercado_pago")
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    if (existingEvent.error) throw existingEvent.error;
    if (existingEvent.data) return res.status(200).json({ ok: true, duplicated: true });

    let providerPayment = null;
    if (providerPaymentId && config.MERCADO_PAGO_ACCESS_TOKEN) {
      providerPayment = await fetchMercadoPagoPayment(providerPaymentId);
    }

    const payment = await findPayment(providerPayment, providerPaymentId);
    const clinicId = payment?.clinic_id ?? providerPayment?.metadata?.clinic_id ?? req.body?.metadata?.clinic_id;
    if (!clinicId) return res.status(200).json({ ok: true, ignored: true });

    await supabase.from("payment_events").insert({
      payment_id: payment?.id ?? null,
      clinic_id: clinicId,
      provider: "mercado_pago",
      event_type: eventType,
      provider_event_id: providerEventId,
      payload: req.body ?? {},
      processed_at: new Date().toISOString()
    });

    if (payment && providerPayment) {
      await updatePaymentFromProvider(payment, providerPayment);
      const updatedPayment = await loadPaymentDetails(payment.id);
      if (updatedPayment?.status === "approved") {
        await sendPaymentApprovedNotifications(updatedPayment);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

async function authenticateOptional(req) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: member, error: memberError } = await supabase
    .from("clinic_members")
    .select("clinic_id, role, active")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  return { user: data.user, role: member?.role ?? profile?.role ?? "patient", clinicId: member?.clinic_id ?? null };
}

async function loadAppointment(appointmentId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, clinics(*), patients(*), services(*)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadAppointmentDetails(appointmentId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*, clinics(*), patients(*), services(*), professionals(*), locations(*)")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function resolveAmount(appointment, amountType) {
  const service = appointment.services;
  const price = Number(service?.price ?? 0);
  const deposit = Number(service?.deposit_amount ?? appointment.deposit_amount ?? 0);
  if (amountType === "deposit") return deposit > 0 ? deposit : price;
  return price;
}

function isPublicPaymentAllowed(appointment) {
  const service = appointment.services;
  return appointment.source === "online" && service?.allow_online_payment !== false && (service?.payment_required || service?.deposit_required);
}

function getCreatePreferenceConfigError() {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return "SUPABASE_SERVER_NOT_CONFIGURED";
  if (!config.MERCADO_PAGO_ACCESS_TOKEN) return "MERCADO_PAGO_NOT_CONFIGURED";
  if (!config.APP_PUBLIC_URL) return "APP_PUBLIC_URL_NOT_CONFIGURED";
  return null;
}

async function createInternalPayment({ appointment, amount, amountType }) {
  const externalReference = `medin_${appointment.id}_${Date.now()}`;
  const { data, error } = await supabase
    .from("payments")
    .insert({
      clinic_id: appointment.clinic_id,
      patient_id: appointment.patient_id,
      appointment_id: appointment.id,
      service_id: appointment.service_id,
      amount,
      currency: "ARS",
      method: "mercado_pago_checkout_pro",
      status: "pending",
      provider: "mercado_pago",
      external_reference: externalReference,
      notes: amountType === "deposit" ? "Sena de reserva online" : "Pago completo"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function createMercadoPagoPreference({ appointment, payment, amount }) {
  const publicUrl = (config.APP_PUBLIC_URL ?? "https://clinic-saas-mvp.vercel.app").replace(/\/$/, "");
  const service = appointment.services;
  const patient = appointment.patients;
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      items: [
        {
          title: service?.name ?? appointment.reason ?? "Turno Medin",
          quantity: 1,
          unit_price: Number(amount),
          currency_id: "ARS"
        }
      ],
      payer: {
        name: patient?.first_name,
        surname: patient?.last_name,
        email: patient?.email ?? undefined
      },
      external_reference: payment.external_reference,
      back_urls: {
        success: `${publicUrl}/pago/exitoso?payment_id=${payment.id}`,
        failure: `${publicUrl}/pago/fallido?payment_id=${payment.id}`,
        pending: `${publicUrl}/pago/pendiente?payment_id=${payment.id}`
      },
      notification_url: `${publicUrl}/api/payments/mercadopago/webhook`,
      metadata: {
        clinic_id: appointment.clinic_id,
        patient_id: appointment.patient_id,
        appointment_id: appointment.id,
        service_id: appointment.service_id,
        payment_id: payment.id
      }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Mercado Pago preference failed");
    error.statusCode = response.status;
    error.code = "MERCADO_PAGO_ERROR";
    error.details = body;
    throw error;
  }
  return body;
}

async function fetchMercadoPagoPayment(providerPaymentId) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${providerPaymentId}`, {
    headers: { Authorization: `Bearer ${config.MERCADO_PAGO_ACCESS_TOKEN}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Mercado Pago payment lookup failed");
    error.statusCode = response.status;
    error.code = "MERCADO_PAGO_LOOKUP_ERROR";
    throw error;
  }
  return body;
}

async function findPayment(providerPayment, providerPaymentId) {
  const metadataPaymentId = providerPayment?.metadata?.payment_id;
  if (metadataPaymentId && isUuid(String(metadataPaymentId))) {
    const payment = await loadPaymentDetails(String(metadataPaymentId));
    if (payment) return payment;
  }

  if (providerPayment?.external_reference) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("external_reference", providerPayment.external_reference)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  if (providerPaymentId) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("provider", "mercado_pago")
      .eq("provider_payment_id", providerPaymentId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

async function resolvePaymentFromRequest(query) {
  const internalPaymentId = String(query.payment_id ?? "");
  if (isUuid(internalPaymentId)) return loadPaymentDetails(internalPaymentId);

  const externalReference = String(query.external_reference ?? "");
  if (externalReference) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("external_reference", externalReference)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const providerPreferenceId = String(query.preference_id ?? query.provider_preference_id ?? "");
  if (providerPreferenceId) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("provider", "mercado_pago")
      .eq("provider_preference_id", providerPreferenceId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const providerPaymentId = String(query.collection_id ?? query["data.id"] ?? query.provider_payment_id ?? "");
  if (providerPaymentId) {
    return findPayment(null, providerPaymentId);
  }

  return null;
}

async function loadPaymentDetails(paymentId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*, clinics(*), patients(*), services(*), appointments(*, professionals(*), locations(*))")
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function resolveProviderPaymentId(query, payment) {
  const candidates = [
    query.payment_id && isLikelyProviderPaymentId(String(query.payment_id)) ? query.payment_id : null,
    query.collection_id,
    query.provider_payment_id,
    query["data.id"],
    query.mp_payment_id,
    payment?.provider_payment_id
  ];
  return String(candidates.find((value) => value && value !== "null" && value !== "undefined") ?? "");
}

async function updatePaymentFromProvider(payment, providerPayment) {
  const status = normalizeStatus(providerPayment.status);
  await supabase
    .from("payments")
    .update({
      status,
      status_detail: providerPayment.status_detail ?? null,
      provider_payment_id: String(providerPayment.id ?? ""),
      payment_method: providerPayment.payment_method_id ?? providerPayment.payment_type_id ?? null,
      payer_email: providerPayment.payer?.email ?? null,
      paid_at: status === "approved" ? providerPayment.date_approved ?? new Date().toISOString() : payment.paid_at,
      updated_at: new Date().toISOString()
    })
    .eq("id", payment.id);

  if (payment.appointment_id) {
    const appointmentPaymentStatus = mapAppointmentPaymentStatus(status, payment.notes);
    const update = { payment_status: appointmentPaymentStatus };
    if (status === "approved") update.status = await resolveApprovedAppointmentStatus(payment.clinic_id);
    await supabase.from("appointments").update(update).eq("id", payment.appointment_id);
  }
}

async function resolveApprovedAppointmentStatus(clinicId) {
  const { data, error } = await supabase
    .from("booking_settings")
    .select("require_manual_confirmation")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw error;
  return data?.require_manual_confirmation ? "pending" : "confirmed";
}

function normalizeStatus(status) {
  const allowed = new Set(["pending", "in_process", "approved", "rejected", "cancelled", "refunded", "charged_back", "expired"]);
  return allowed.has(status) ? status : "pending";
}

function mapAppointmentPaymentStatus(status, notes) {
  if (status === "approved") return String(notes ?? "").includes("Sena") ? "deposit_paid" : "paid";
  if (status === "rejected" || status === "cancelled" || status === "expired") return "payment_failed";
  if (status === "refunded") return "refunded";
  return String(notes ?? "").includes("Sena") ? "deposit_pending" : "unpaid";
}

async function sendPaymentApprovedNotifications(payment) {
  if (!config.RESEND_API_KEY) return;
  await sendPatientPaymentEmail(payment);
  await sendClinicPaymentEmail(payment);
}

async function sendPatientPaymentEmail(payment) {
  const patient = payment.patients;
  if (!patient?.email) return;
  const alreadySent = await hasMessageLog({
    relatedType: "payment_confirmation_email",
    relatedId: payment.id,
    recipient: patient.email
  });
  if (alreadySent) return;

  const detail = buildAppointmentDetail(payment);
  const subject = payment.appointments?.status === "confirmed" && detail.hasSchedule
    ? "Tu turno fue confirmado"
    : isDepositPayment(payment) ? "Tu seña fue acreditada" : "Tu pago fue acreditado";
  const body = buildPatientEmail(payment);
  await sendLoggedEmail({
    clinicId: payment.clinic_id,
    patientId: payment.patient_id,
    appointmentId: payment.appointment_id,
    recipient: patient.email,
    subject,
    text: body.text,
    html: body.html,
    relatedType: "payment_confirmation_email",
    relatedId: payment.id
  });
}

async function sendClinicPaymentEmail(payment) {
  const recipient = payment.clinics?.email;
  if (!recipient) return;
  const alreadySent = await hasMessageLog({
    relatedType: "payment_internal_email",
    relatedId: payment.id,
    recipient
  });
  if (alreadySent) return;

  const detail = buildAppointmentDetail(payment);
  const text = [
    "Nuevo turno confirmado con pago.",
    "",
    `Paciente: ${detail.patientName}`,
    `Servicio: ${detail.serviceName}`,
    `Profesional: ${detail.professionalName}`,
    `Fecha: ${detail.dateLabel}`,
    `Hora: ${detail.timeLabel}`,
    `Monto pagado: ${formatMoney(payment.amount, payment.currency)}`,
    `Payment ID: ${payment.id}`,
    `Estado: ${payment.status}`
  ].join("\n");

  await sendLoggedEmail({
    clinicId: payment.clinic_id,
    patientId: payment.patient_id,
    appointmentId: payment.appointment_id,
    recipient,
    subject: "Nuevo turno confirmado con pago",
    text,
    html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
    relatedType: "payment_internal_email",
    relatedId: payment.id
  });
}

async function hasMessageLog({ relatedType, relatedId, recipient }) {
  const { data, error } = await supabase
    .from("message_logs")
    .select("id")
    .eq("related_entity_type", relatedType)
    .eq("related_entity_id", relatedId)
    .eq("recipient", recipient)
    .in("status", ["pending", "sent"])
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function sendLoggedEmail({ clinicId, patientId, appointmentId, recipient, subject, text, html, relatedType, relatedId }) {
  const { data: log, error: logError } = await supabase
    .from("message_logs")
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      appointment_id: appointmentId,
      channel: "email",
      provider: "resend",
      recipient,
      subject,
      body_preview: stripHtml(text).slice(0, 180),
      status: "pending",
      related_entity_type: relatedType,
      related_entity_id: relatedId
    })
    .select("id")
    .single();
  if (logError) throw logError;

  try {
    const sent = await sendWithResend({ to: recipient, subject, text, html });
    await supabase
      .from("message_logs")
      .update({ status: "sent", provider_message_id: sent.id ?? null, sent_at: new Date().toISOString() })
      .eq("id", log.id);
  } catch (error) {
    await supabase
      .from("message_logs")
      .update({ status: "failed", error_message: "No pudimos enviar el email con Resend." })
      .eq("id", log.id);
  }
}

async function sendWithResend({ to, subject, text, html }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.RESEND_FROM_EMAIL,
      reply_to: config.RESEND_REPLY_TO_EMAIL || undefined,
      to: [to],
      subject,
      text,
      html
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("Resend request failed");
    error.statusCode = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

function buildPatientEmail(payment) {
  const detail = buildAppointmentDetail(payment);
  const isConfirmed = payment.appointments?.status === "confirmed" && detail.hasSchedule;
  const calendarUrl = `${(config.APP_PUBLIC_URL ?? "").replace(/\/$/, "")}/api/appointments/${payment.appointment_id}/calendar.ics`;
  const remaining = Math.max(Number(detail.servicePrice) - Number(payment.amount), 0);
  const pendingCopy = isDepositPayment(payment)
    ? "Recibimos tu seña. La clínica confirmará el día y horario de tu turno."
    : "Recibimos tu pago. La clínica confirmará el día y horario de tu turno.";
  const lines = [
    `Hola ${detail.patientName},`,
    "",
    isConfirmed ? "Tu turno fue confirmado." : pendingCopy,
    "",
    "Detalle:",
    "",
    `Servicio: ${detail.serviceName}`,
    `Profesional: ${detail.professionalName}`,
    `Fecha: ${detail.dateLabel}`,
    `Hora: ${detail.timeLabel}`,
    `Clínica: ${detail.clinicName}`,
    `Dirección: ${detail.locationAddress}`,
    `Monto pagado: ${formatMoney(payment.amount, payment.currency)}`,
    `Tipo de pago: ${isDepositPayment(payment) ? "Seña" : "Pago total"}`,
    `Saldo pendiente: ${formatMoney(remaining, payment.currency)}`,
    "",
    "Si necesitás modificar o cancelar tu turno, comunicate con la clínica."
  ];
  return {
    text: lines.join("\n"),
    html: `<p>Hola ${escapeHtml(detail.patientName)},</p><p>${isConfirmed ? "Tu turno fue confirmado." : escapeHtml(pendingCopy)}</p><ul><li>Servicio: ${escapeHtml(detail.serviceName)}</li><li>Profesional: ${escapeHtml(detail.professionalName)}</li><li>Fecha: ${escapeHtml(detail.dateLabel)}</li><li>Hora: ${escapeHtml(detail.timeLabel)}</li><li>Clínica: ${escapeHtml(detail.clinicName)}</li><li>Dirección: ${escapeHtml(detail.locationAddress)}</li><li>Monto pagado: ${escapeHtml(formatMoney(payment.amount, payment.currency))}</li><li>Tipo de pago: ${isDepositPayment(payment) ? "Seña" : "Pago total"}</li><li>Saldo pendiente: ${escapeHtml(formatMoney(remaining, payment.currency))}</li></ul>${isConfirmed ? `<p><a href="${escapeHtml(calendarUrl)}">Agregar al calendario</a></p>` : ""}<p>Si necesitás modificar o cancelar tu turno, comunicate con la clínica.</p>`
  };
}

function toPaymentStatusResponse(payment) {
  const detail = buildAppointmentDetail(payment);
  const remainingAmount = Math.max(Number(detail.servicePrice) - Number(payment.amount), 0);
  return {
    id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    amount: Number(payment.amount),
    currency: payment.currency,
    checkout_url: payment.checkout_url,
    paid_at: payment.paid_at,
    payment_type: isDepositPayment(payment) ? "deposit" : "full",
    remaining_amount: remainingAmount,
    appointment: {
      id: payment.appointment_id,
      status: payment.appointments?.status ?? null,
      payment_status: payment.appointments?.payment_status ?? null,
      starts_at: payment.appointments?.starts_at ?? null,
      end_time: payment.appointments?.end_time ?? null,
      patient_name: detail.patientName,
      service_name: detail.serviceName,
      professional_name: detail.professionalName,
      clinic_name: detail.clinicName,
      timezone: detail.timezone,
      clinic_phone: payment.clinics?.phone ?? null,
      location_name: payment.appointments?.locations?.name ?? null,
      location_address: detail.locationAddress,
      duration_minutes: detail.durationMinutes,
      has_schedule: detail.hasSchedule
    }
  };
}

function buildAppointmentDetail(payment) {
  const appointment = payment.appointments ?? {};
  const service = payment.services ?? {};
  const patient = payment.patients ?? {};
  const professional = appointment.professionals ?? {};
  const clinic = payment.clinics ?? {};
  const location = appointment.locations ?? {};
  const startsAt = appointment.starts_at ?? appointment.start_time ?? null;
  const timezone = clinic.timezone ?? "America/Argentina/Mendoza";
  return {
    patientName: [patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Paciente",
    serviceName: service.name ?? appointment.reason ?? "Turno",
    professionalName: [professional.name, professional.last_name].filter(Boolean).join(" ") || "Profesional a confirmar",
    clinicName: clinic.name ?? "Medin",
    locationAddress: location.address ?? clinic.address ?? "Dirección a confirmar",
    timezone,
    dateLabel: startsAt ? new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: timezone }).format(new Date(startsAt)) : "Fecha a confirmar",
    timeLabel: startsAt ? new Intl.DateTimeFormat("es-AR", { timeStyle: "short", timeZone: timezone }).format(new Date(startsAt)) : "Hora a confirmar",
    durationMinutes: Number(service.duration_minutes ?? 30),
    servicePrice: Number(service.price ?? payment.amount ?? 0),
    hasSchedule: Boolean(startsAt)
  };
}

function buildIcsEvent(appointment) {
  const service = appointment.services ?? {};
  const clinic = appointment.clinics ?? {};
  const professional = appointment.professionals ?? {};
  const location = appointment.locations ?? {};
  const startsAt = appointment.starts_at ?? appointment.start_time;
  if (!startsAt) {
    const error = new Error("Appointment has no schedule");
    error.statusCode = 422;
    error.code = "APPOINTMENT_WITHOUT_SCHEDULE";
    throw error;
  }
  const start = new Date(startsAt);
  const end = appointment.end_time ? new Date(appointment.end_time) : new Date(start.getTime() + Number(service.duration_minutes ?? 30) * 60_000);
  const title = `Turno en ${clinic.name ?? "Medin"} - ${service.name ?? appointment.reason ?? "Consulta"}`;
  const description = [
    `Servicio: ${service.name ?? "Consulta"}`,
    `Profesional: ${[professional.name, professional.last_name].filter(Boolean).join(" ") || "A confirmar"}`,
    clinic.phone ? `Contacto: ${clinic.phone}` : ""
  ].filter(Boolean).join("\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Medin//ClinicOS//ES",
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

function isDepositPayment(payment) {
  return String(payment.notes ?? "").toLowerCase().includes("sena") || String(payment.notes ?? "").toLowerCase().includes("seña");
}

function formatMoney(value, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS" }).format(Number(value ?? 0));
}

function toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function verifyWebhook(req) {
  if (!config.MERCADO_PAGO_WEBHOOK_SECRET) return true;
  const signature = req.get("x-signature") ?? "";
  const [, v1] = signature.match(/v1=([^,]+)/) ?? [];
  if (!v1 || !req.rawBody) return false;
  const expected = crypto
    .createHmac("sha256", config.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest("hex");
  return expected.length === v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isLikelyProviderPaymentId(value) {
  return /^\d{5,}$/.test(value);
}
