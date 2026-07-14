import { makeSupabase } from "../../_lib/supabase.js";
import { allowOnly, handleError, readQueryValue } from "../../_lib/http.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    const payment = await resolvePayment(client, req.query ?? {});
    if (payment === "MISSING_IDENTIFIER") {
      return res.status(400).json({ error: "MISSING_PAYMENT_IDENTIFIER" });
    }
    if (!payment) return res.status(404).json({ error: "PAYMENT_NOT_FOUND" });
    return res.status(200).json(toStatusResponse(payment));
  } catch (err) {
    return handleError(res, err);
  }
}

async function resolvePayment(client, query) {
  const paymentId = readQueryValue(query.payment_id);
  const externalReference = readQueryValue(query.external_reference);
  const preferenceId = readQueryValue(query.preference_id || query.provider_preference_id);
  const providerPaymentId = readQueryValue(query.collection_id || query["data.id"] || query.provider_payment_id);

  if (!paymentId && !externalReference && !preferenceId && !providerPaymentId) {
    return "MISSING_IDENTIFIER";
  }

  const select = "*, appointments(id, status, payment_status, starts_at, end_time)";

  if (UUID_RE.test(paymentId)) {
    const { data, error } = await client.from("payments").select(select).eq("id", paymentId).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (externalReference) {
    const { data, error } = await client.from("payments").select(select).eq("external_reference", externalReference).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (preferenceId) {
    const { data, error } = await client
      .from("payments")
      .select(select)
      .eq("provider", "mercado_pago")
      .eq("provider_preference_id", preferenceId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (providerPaymentId) {
    const { data, error } = await client
      .from("payments")
      .select(select)
      .eq("provider", "mercado_pago")
      .eq("provider_payment_id", providerPaymentId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

function toStatusResponse(payment) {
  return {
    id: payment.id,
    status: payment.status,
    status_detail: payment.status_detail,
    amount: Number(payment.amount ?? 0),
    currency: payment.currency,
    checkout_url: payment.checkout_url,
    paid_at: payment.paid_at,
    appointment: payment.appointments
      ? {
          id: payment.appointments.id,
          status: payment.appointments.status,
          payment_status: payment.appointments.payment_status,
          starts_at: payment.appointments.starts_at,
          end_time: payment.appointments.end_time
        }
      : null
  };
}
