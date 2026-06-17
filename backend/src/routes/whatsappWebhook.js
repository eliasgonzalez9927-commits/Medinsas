import { Router } from "express";
import { config } from "../config.js";
import { runClinicAgent } from "../agent/agent.js";
import { logger } from "../lib/logger.js";
import { markInboundMessageProcessed, reserveInboundMessage } from "../lib/messageLog.js";
import { findProfileByPhone } from "../lib/profiles.js";
import {
  extractIncomingMessages,
  sendWhatsAppText,
  verifyMetaSignature
} from "../lib/whatsapp.js";

export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

whatsappWebhookRouter.post("/webhook/whatsapp", async (req, res) => {
  const signature = req.header("x-hub-signature-256");

  if (!verifyMetaSignature({ rawBody: req.rawBody, signature })) {
    return res.sendStatus(401);
  }

  const messages = extractIncomingMessages(req.body);
  res.sendStatus(200);

  for (const message of messages) {
    processMessage(message).catch((error) => {
      logger.error({ err: error, messageId: message.messageId }, "WhatsApp message processing failed");
    });
  }
});

async function processMessage(message) {
  const shouldProcess = await reserveInboundMessage(message.messageId, message.from);
  if (!shouldProcess) return;

  const profile = await findProfileByPhone(message.from);

  if (!profile) {
    await sendWhatsAppText({
      to: message.from,
      text:
        "Hola. No encontre tu numero asociado a una cuenta de la clinica. Contacta a administracion para activar tu acceso."
    });
    await markInboundMessageProcessed(message.messageId, "unknown_profile");
    return;
  }

  try {
    const reply = await runClinicAgent({
      user: profile,
      text: message.text
    });

    await sendWhatsAppText({
      to: message.from,
      text: reply
    });

    await markInboundMessageProcessed(message.messageId, "processed");
  } catch (error) {
    await markInboundMessageProcessed(message.messageId, "failed", error.message);
    throw error;
  }
}
