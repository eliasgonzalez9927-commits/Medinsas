import { makeSupabase } from "../../_lib/supabase.js";
import { allowOnly, handleError } from "../../_lib/http.js";
import { getClinicMercadoPagoAccessToken } from "../../_lib/mercadoPagoAccount.js";

const MARKETPLACE_FEE_PERCENTAGE = Number(process.env.MERCADO_PAGO_MARKETPLACE_FEE_PERCENTAGE ?? "3");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["POST"])) return;

  // Feature gate: kept explicit even now that the webhook exists (see
  // webhook.js), so this stays off until it's been verified end-to-end
  // against a real Mercado Pago sandbox account. Each clinic also needs its
  // own OAuth-connected Mercado Pago account (see oauth/start.js) - there is
  // no shared platform token this falls back to.
  if (process.env.MERCADO_PAGO_CREATE_PREFERENCE_ENABLED !== "true") {
    return res.status(503).json({
      error: "MERCADO_PAGO_FLOW_DISABLED",
      message: "Mercado Pago todavía no está habilitado para generar links."
    });
  }

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  const appointmentId = String(req.body?.appointmentId ?? "");
  const amountType = req.body?.amountType === "full" ? "full" : "deposit";
  if (!UUID_RE.test(appointmentId)) {
    return res.status(400).json({ error: "INVALID_APPOINTMENT_ID" });
  }

  try {
    const appointment = await loadAppointment(client, appointmentId);
    if (!appointment) return res.status(404).json({ error: "APPOINTMENT_NOT_FOUND" });

    const auth = await authenticateOptional(client, req);
    if (auth?.clinicId && auth.role !== "platform_admin" && auth.clinicId !== appointment.clinic_id) {
      return res.status(403).json({ error: "FORBIDDEN_CLINIC" });
    }
    if (!auth && !isPublicPaymentAllowed(appointment)) {
      return res.status(403).json({ error: "PUBLIC_PAYMENT_NOT_ALLOWED" });
    }

    // Every clinic pays with its own connected Mercado Pago account - there
    // is no shared platform token anymore. No connection, no payment link.
    const clinicAccessToken = await getClinicMercadoPagoAccessToken(client, appointment.clinic_id);
    if (!clinicAccessToken) {
      return res.status(503).json({ error: "MERCADO_PAGO_NOT_CONNECTED" });
    }

    const amount = resolveAmount(appointment, amountType);
    if (!amount || amount <= 0) return res.status(400).json({ error: "INVALID_AMOUNT" });

    // Idempotency: reuse a still-valid pending/in_process Mercado Pago payment
    // for this exact appointment + amount instead of inserting a new row on
    // every click/retry. If a matching row already has a checkout_url, return
    // it as-is with no new Mercado Pago call at all.
    const existing = await findReusablePendingPayment(client, {
      clinicId: appointment.clinic_id,
      appointmentId: appointment.id,
      amount
    });

    if (existing?.checkout_url && existing?.provider_preference_id) {
      return res.status(200).json({
        payment_id: existing.id,
        checkout_url: existing.checkout_url,
        provider_preference_id: existing.provider_preference_id,
        external_reference: existing.external_reference,
        reused: true
      });
    }

    const expiresAt = await resolvePaymentExpiration(client, appointment.clinic_id);
    const payment = existing ?? (await createInternalPayment(client, { appointment, amount, amountType, expiresAt }));

    const preference = await createMercadoPagoPreference({ appointment, payment, amount, accessToken: clinicAccessToken });
    const checkoutUrl = preference.init_point ?? preference.sandbox_init_point ?? null;

    const { error: updateError } = await client
      .from("payments")
      .update({
        provider_preference_id: preference.id,
        checkout_url: checkoutUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", payment.id)
      .eq("clinic_id", appointment.clinic_id);
    if (updateError) throw updateError;

    if (!existing) {
      const { error: appointmentError } = await client
        .from("appointments")
        .update({
          payment_required: true,
          payment_status: amountType === "deposit" ? "deposit_pending" : "unpaid",
          deposit_amount: amountType === "deposit" ? amount : appointment.deposit_amount
        })
        .eq("id", appointment.id)
        .eq("clinic_id", appointment.clinic_id);
      if (appointmentError) throw appointmentError;
    }

    return res.status(200).json({
      payment_id: payment.id,
      checkout_url: checkoutUrl,
      provider_preference_id: preference.id,
      external_reference: payment.external_reference,
      reused: false
    });
  } catch (err) {
    if (err?.code === "MERCADO_PAGO_ERROR") {
      return res.status(err.statusCode ?? 502).json({ error: "CREATE_PREFERENCE_FAILED", message: "Mercado Pago no pudo generar el link de pago." });
    }
    return handleError(res, err);
  }
}

async function loadAppointment(client, appointmentId) {
  const { data, error } = await client
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, service_id, source, deposit_amount, payment_required, payment_status, services(name, price, deposit_amount, payment_required, deposit_required, allow_online_payment), patients(first_name, last_name, email)"
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function authenticateOptional(client, req) {
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
  return { clinicId: member?.clinic_id ?? null, role: member?.role ?? null };
}

function isPublicPaymentAllowed(appointment) {
  const service = appointment.services;
  return (
    appointment.source === "online" &&
    service?.allow_online_payment !== false &&
    (service?.payment_required || service?.deposit_required)
  );
}

function resolveAmount(appointment, amountType) {
  const service = appointment.services;
  const price = Number(service?.price ?? 0);
  const deposit = Number(service?.deposit_amount ?? appointment.deposit_amount ?? 0);
  if (amountType === "deposit") return deposit > 0 ? deposit : price;
  return price;
}

async function findReusablePendingPayment(client, { clinicId, appointmentId, amount }) {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("appointment_id", appointmentId)
    .eq("provider", "mercado_pago")
    .in("status", ["pending", "in_process"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
  if (Number(data.amount) !== Number(amount)) return null;
  return data;
}

async function resolvePaymentExpiration(client, clinicId) {
  const { data, error } = await client
    .from("payment_settings")
    .select("payment_link_expiration_minutes")
    .eq("clinic_id", clinicId)
    .eq("provider", "mercado_pago")
    .maybeSingle();
  if (error) throw error;
  const minutes = Number(data?.payment_link_expiration_minutes || 1440);
  return new Date(Date.now() + Math.max(minutes, 15) * 60_000).toISOString();
}

async function createInternalPayment(client, { appointment, amount, amountType, expiresAt }) {
  const externalReference = `medin_${appointment.id}_${Date.now()}`;
  const { data, error } = await client
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
      expires_at: expiresAt,
      notes: amountType === "deposit" ? "Seña de reserva online" : "Pago completo"
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function createMercadoPagoPreference({ appointment, payment, amount, accessToken }) {
  const publicUrl = (process.env.APP_PUBLIC_URL || "https://app.medin.com.ar").replace(/\/$/, "");
  const service = appointment.services;
  const patient = appointment.patients;
  // marketplace_fee is an absolute amount (not a percentage) taken from the
  // seller's (clinic's) payment and deposited into the marketplace
  // application owner's own Mercado Pago account - Mercado Pago splits it
  // automatically because this preference is created with the clinic's own
  // OAuth-connected access token.
  const marketplaceFee = Math.round(Number(amount) * (MARKETPLACE_FEE_PERCENTAGE / 100) * 100) / 100;
  const preferencePayload = {
    items: [
      {
        title: service?.name ?? "Turno Medin",
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
    marketplace_fee: marketplaceFee,
    back_urls: {
      success: `${publicUrl}/pago/exitoso?payment_id=${payment.id}`,
      failure: `${publicUrl}/pago/fallido?payment_id=${payment.id}`,
      pending: `${publicUrl}/pago/pendiente?payment_id=${payment.id}`
    },
    expires: Boolean(payment.expires_at),
    expiration_date_from: payment.expires_at ? new Date().toISOString() : undefined,
    expiration_date_to: payment.expires_at ?? undefined,
    // clinic_id in the query string is how the webhook (a single shared
    // endpoint for every connected clinic) knows whose Mercado Pago token to
    // use to look up the payment - it has no other way to resolve that
    // before making the API call.
    notification_url: `${publicUrl}/api/payments/mercadopago/webhook?clinic_id=${appointment.clinic_id}`,
    metadata: {
      clinic_id: appointment.clinic_id,
      patient_id: appointment.patient_id,
      appointment_id: appointment.id,
      service_id: appointment.service_id,
      payment_id: payment.id
    }
  };

  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(preferencePayload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error("Mercado Pago preference failed");
    err.statusCode = response.status;
    err.code = "MERCADO_PAGO_ERROR";
    throw err;
  }
  return body;
}
