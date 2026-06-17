import crypto from "node:crypto";
import { config } from "../config.js";

export function verifyMetaSignature({ rawBody, signature }) {
  if (!config.WHATSAPP_APP_SECRET) return true;
  if (!signature?.startsWith("sha256=")) return false;

  const expected = crypto
    .createHmac("sha256", config.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  const received = signature.replace("sha256=", "");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function extractIncomingMessages(payload) {
  const messages = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      for (const message of value?.messages ?? []) {
        if (message.type !== "text") continue;
        messages.push({
          messageId: message.id,
          from: normalizePhone(message.from),
          text: message.text?.body?.trim() ?? "",
          timestamp: message.timestamp,
          metadata: value.metadata
        });
      }
    }
  }

  return messages.filter((message) => message.text);
}

export async function sendWhatsAppText({ to, text }) {
  const url = `https://graph.facebook.com/${config.WHATSAPP_GRAPH_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text.slice(0, 3900)
      }
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Meta WhatsApp API error: ${details}`);
  }

  return response.json();
}

export function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}
