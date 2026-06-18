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
    const paymentId = String(req.query.payment_id ?? "");
    if (!isUuid(paymentId)) return res.status(400).json({ error: "INVALID_PAYMENT_ID" });
    const { data, error } = await supabase
      .from("payments")
      .select("id, status, amount, currency, checkout_url, provider_payment_id, provider_preference_id, appointment_id, patient_id, service_id, paid_at")
      .eq("id", paymentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "PAYMENT_NOT_FOUND" });
    res.status(200).json(data);
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
    if (status === "approved") update.status = "confirmed";
    await supabase.from("appointments").update(update).eq("id", payment.appointment_id);
  }
}

function normalizeStatus(status) {
  const allowed = new Set(["pending", "in_process", "approved", "rejected", "cancelled", "refunded", "charged_back", "expired"]);
  return allowed.has(status) ? status : "pending";
}

function mapAppointmentPaymentStatus(status, notes) {
  if (status === "approved") return String(notes ?? "").includes("Sena") ? "deposit_paid" : "paid";
  if (status === "rejected") return "rejected";
  if (status === "refunded") return "refunded";
  return String(notes ?? "").includes("Sena") ? "deposit_pending" : "unpaid";
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
