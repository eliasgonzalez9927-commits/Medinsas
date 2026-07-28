import crypto from "node:crypto";
import { makeSupabase } from "../_lib/supabase.js";
import { allowOnly, handleError } from "../_lib/http.js";

// Meta firma el webhook con el HMAC del body crudo (X-Hub-Signature-256) -
// si Vercel ya parseo el JSON, re-serializarlo con JSON.stringify no
// reproduce necesariamente los mismos bytes (orden de claves, espacios) y
// la firma no matchea. Por eso se desactiva el bodyParser automatico y se
// lee el stream a mano antes de parsear.
export const config = {
  api: {
    bodyParser: false
  }
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// GET  -> handshake de verificacion que Meta hace una sola vez al
//         registrar la URL del webhook en el dashboard de la App.
// POST -> eventos reales (estado de plantillas, estado de mensajes).
export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET", "POST"])) return;

  if (req.method === "GET") return handleVerification(req, res);

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    const rawBody = await readRawBody(req);
    if (!verifySignature(req, rawBody)) {
      return res.status(401).json({ error: "INVALID_SIGNATURE" });
    }
    const payload = JSON.parse(rawBody.toString("utf8") || "{}");
    await processWebhookPayload(client, payload);
    // Meta reintenta si no responde 200 rapido - siempre 200 salvo firma
    // invalida, igual que el webhook de Mercado Pago.
    return res.status(200).json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

function handleVerification(req, res) {
  const mode = req.query?.["hub.mode"];
  const token = req.query?.["hub.verify_token"];
  const challenge = req.query?.["hub.challenge"];
  if (mode === "subscribe" && token && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.setHeader("Content-Type", "text/plain");
    return res.status(200).send(String(challenge ?? ""));
  }
  return res.status(403).json({ error: "VERIFICATION_FAILED" });
}

function verifySignature(req, rawBody) {
  const signatureHeader = req.headers["x-hub-signature-256"];
  if (!signatureHeader || !process.env.META_APP_SECRET) return false;
  const expected = `sha256=${crypto.createHmac("sha256", process.env.META_APP_SECRET).update(rawBody).digest("hex")}`;
  const provided = Buffer.from(String(signatureHeader));
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(provided, expectedBuffer);
}

async function processWebhookPayload(client, payload) {
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      if (change.field === "message_template_status_update") {
        await handleTemplateStatusUpdate(client, change.value);
      } else if (change.field === "messages") {
        await handleMessagesUpdate(client, change.value);
      }
    }
  }
}

async function handleTemplateStatusUpdate(client, value) {
  const metaTemplateId = value?.message_template_id ? String(value.message_template_id) : null;
  const status = String(value?.event ?? value?.status ?? "").toLowerCase();
  if (!metaTemplateId || !status) return;
  const { error } = await client
    .from("whatsapp_message_templates")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("meta_template_id", metaTemplateId);
  if (error) throw error;
}

async function handleMessagesUpdate(client, value) {
  const statuses = value?.statuses ?? [];
  for (const status of statuses) {
    // notification_deliveries no guarda el message id de WhatsApp hoy -
    // alcance minimo del MVP: solo actualiza si ya existe una fila para
    // ese id (ver Parte F, sendWhatsAppMessage guarda provider_message_id).
    const { error } = await client
      .from("notification_deliveries")
      .update({ status: mapWhatsAppStatus(status.status) })
      .eq("provider_message_id", status.id);
    if (error) throw error;
  }
}

function mapWhatsAppStatus(metaStatus) {
  if (metaStatus === "delivered" || metaStatus === "read") return "sent";
  if (metaStatus === "failed") return "failed";
  return "pending";
}
