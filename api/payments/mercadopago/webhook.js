import crypto from "node:crypto";
import { makeSupabase } from "../../_lib/supabase.js";
import { allowOnly, handleError } from "../../_lib/http.js";
import { getClinicMercadoPagoAccessToken } from "../../_lib/mercadoPagoAccount.js";

// Mercado Pago calls this URL every time a payment's status changes. This is
// the piece create-preference.js was waiting on (see the comment and feature
// flag there) - without it, payments.status never leaves "pending" no matter
// what actually happens on Mercado Pago's side.
//
// Mercado Pago retries on anything other than a 2xx, so once we've done what
// we reasonably can with a notification we ack with 200 even if we chose to
// ignore it (wrong topic, duplicate, payment not found) - only real failures
// (bad signature, DB error) return non-2xx so MP retries those.
export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET", "POST"])) return;

  const { client, error: dbError, missing } = makeSupabase();
  if (dbError) return res.status(500).json({ error: dbError, missing });

  try {
    const paymentId = extractPaymentId(req);
    if (!paymentId) {
      // Not a payment notification (e.g. merchant_order, or a topic we don't
      // handle) - nothing to do.
      return res.status(200).json({ ignored: true });
    }

    if (!verifySignature(req, paymentId)) {
      return res.status(401).json({ error: "INVALID_SIGNATURE" });
    }

    // Every clinic pays into its own Mercado Pago account, so looking up a
    // payment requires that clinic's own token - create-preference.js puts
    // clinic_id on the notification_url query string precisely so this
    // shared endpoint can resolve it before calling Mercado Pago's API.
    const clinicId = readFirst(req.query?.clinic_id);
    if (!clinicId) return res.status(200).json({ ignored: true });

    const accessToken = await getClinicMercadoPagoAccessToken(client, clinicId);
    if (!accessToken) return res.status(200).json({ ignored: true });

    const mpPayment = await fetchMercadoPagoPayment(paymentId, accessToken);
    if (!mpPayment) return res.status(200).json({ ignored: true });

    const isNewEvent = await recordEvent(client, paymentId, mpPayment);
    if (!isNewEvent) return res.status(200).json({ deduped: true });

    await syncPayment(client, mpPayment);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

function extractPaymentId(req) {
  const query = req.query ?? {};
  const fromQuery = readFirst(query["data.id"]) || (readFirst(query.topic) === "payment" ? readFirst(query.id) : "");
  if (fromQuery) return fromQuery;

  const body = req.body ?? {};
  if (body?.type === "payment" && body?.data?.id) return String(body.data.id);
  if (body?.topic === "payment" && body?.resource) {
    const match = String(body.resource).match(/(\d+)\s*$/);
    if (match) return match[1];
  }
  return "";
}

function readFirst(value) {
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

// https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/additional-content/notifications/webhooks#editor_5
// manifest = "id:{data.id};request-id:{x-request-id};ts:{ts};" signed with
// HMAC-SHA256 using the webhook secret from the Mercado Pago dashboard.
// Fails closed: no secret configured means no signature can be trusted, so
// nothing gets processed until MERCADO_PAGO_WEBHOOK_SECRET is set.
function verifySignature(req, paymentId) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return false;

  const signatureHeader = req.headers["x-signature"];
  const requestId = req.headers["x-request-id"];
  if (!signatureHeader || !requestId) return false;

  const parts = Object.fromEntries(
    String(signatureHeader)
      .split(",")
      .map((part) => part.split("=").map((piece) => piece.trim()))
      .filter((piece) => piece.length === 2)
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const dataIdForManifest = readFirst(req.query?.["data.id"]) || paymentId;
  const manifest = `id:${dataIdForManifest.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(String(v1), "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function fetchMercadoPagoPayment(paymentId, accessToken) {
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const err = new Error(`Mercado Pago payment lookup failed (${response.status})`);
    err.code = "MERCADO_PAGO_ERROR";
    throw err;
  }
  return response.json();
}

// payment_events has a unique(provider, provider_event_id) constraint -
// insert is the dedup check itself. Mercado Pago sends the same
// notification more than once by design (at-least-once delivery); without
// this, a "refunded" webhook that arrives twice could apply twice, or two
// concurrent workers could double-process the same status change.
async function recordEvent(client, paymentId, mpPayment) {
  const eventId = `${paymentId}:${mpPayment.status}:${mpPayment.date_last_updated ?? mpPayment.date_created ?? ""}`;
  const { error } = await client.from("payment_events").insert({
    provider: "mercado_pago",
    provider_event_id: eventId,
    event_type: mpPayment.status,
    payload: mpPayment
  });
  if (!error) return true;
  if (error.code === "23505") return false; // duplicate delivery of the same status transition
  throw error;
}

const STATUS_MAP = {
  approved: "approved",
  authorized: "in_process",
  in_process: "in_process",
  in_mediation: "in_process",
  pending: "pending",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded"
};

// Mirrors src/lib/clinic-data.ts's APPOINTMENT_PAYMENT_STATUS_RANK /
// classifyManualPayment - kept in sync by hand since this runs in a
// separate serverless runtime with its own module graph.
const APPOINTMENT_PAYMENT_STATUS_RANK = {
  unpaid: 0,
  payment_failed: 0,
  rejected: 0,
  refunded: 0,
  deposit_pending: 1,
  deposit_paid: 2,
  paid: 3
};

async function syncPayment(client, mpPayment) {
  const payment = await findInternalPayment(client, mpPayment);
  if (!payment) return; // notification for a payment Medin didn't create - nothing to sync

  const status = STATUS_MAP[mpPayment.status] ?? mpPayment.status;
  const paidAt = mpPayment.status === "approved" ? mpPayment.date_approved ?? new Date().toISOString() : payment.paid_at;

  const { error: updateError } = await client
    .from("payments")
    .update({
      status,
      status_detail: mpPayment.status_detail ?? null,
      provider_payment_id: String(mpPayment.id),
      payment_method: mpPayment.payment_method_id ?? null,
      payer_email: mpPayment.payer?.email ?? null,
      paid_at: paidAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", payment.id);
  if (updateError) throw updateError;

  if (payment.appointment_id) {
    await syncAppointmentPaymentStatus(client, { ...payment, status }, mpPayment.status);
  }
}

async function findInternalPayment(client, mpPayment) {
  if (mpPayment.external_reference) {
    const { data, error } = await client
      .from("payments")
      .select("*")
      .eq("external_reference", mpPayment.external_reference)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("provider", "mercado_pago")
    .eq("provider_preference_id", mpPayment.order?.id ?? mpPayment.preference_id ?? "")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function classifyPaymentKind(client, payment) {
  if (!payment.service_id) return "full";
  const { data: service, error } = await client
    .from("services")
    .select("price, payment_required, deposit_required")
    .eq("id", payment.service_id)
    .eq("clinic_id", payment.clinic_id)
    .maybeSingle();
  if (error) throw error;

  const price = Number(service?.price ?? 0);
  const amount = Number(payment.amount ?? 0);
  if (price > 0 && amount >= price) return "full";
  if (service?.payment_required && !service?.deposit_required) return "full";
  const notesLookLikeDeposit = String(payment.notes ?? "").toLowerCase().includes("seña");
  if (service?.deposit_required || notesLookLikeDeposit) return "deposit";
  return "full";
}

async function syncAppointmentPaymentStatus(client, payment, mpStatus) {
  const { data: appointment, error: readError } = await client
    .from("appointments")
    .select("payment_status")
    .eq("id", payment.appointment_id)
    .eq("clinic_id", payment.clinic_id)
    .maybeSingle();
  if (readError) throw readError;
  if (!appointment) return;

  const currentStatus = appointment.payment_status ?? "unpaid";

  // A refund/chargeback is the ground truth for this specific payment and
  // must always apply, even over an appointment already marked "paid" -
  // unlike the "never downgrade" guard below, which exists to stop one
  // payment attempt from clobbering a status a different, larger payment on
  // the same appointment already achieved.
  if (mpStatus === "refunded" || mpStatus === "charged_back") {
    await client
      .from("appointments")
      .update({ payment_status: "refunded" })
      .eq("id", payment.appointment_id)
      .eq("clinic_id", payment.clinic_id);
    return;
  }

  let nextStatus;
  if (mpStatus === "approved") {
    const kind = await classifyPaymentKind(client, payment);
    nextStatus = kind === "deposit" ? "deposit_paid" : "paid";
  } else if (mpStatus === "rejected" || mpStatus === "cancelled") {
    nextStatus = "rejected";
  } else {
    nextStatus = "deposit_pending";
  }

  if (APPOINTMENT_PAYMENT_STATUS_RANK[nextStatus] <= APPOINTMENT_PAYMENT_STATUS_RANK[currentStatus]) {
    return;
  }

  const { error: updateError } = await client
    .from("appointments")
    .update({ payment_status: nextStatus })
    .eq("id", payment.appointment_id)
    .eq("clinic_id", payment.clinic_id);
  if (updateError) throw updateError;
}
