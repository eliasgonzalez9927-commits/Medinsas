import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { supabase } from "../lib/supabase.js";
import { logger } from "../lib/logger.js";
import { assertPermission } from "../security/permissions.js";

export const messagesRouter = Router();

const sendSchema = z.object({
  clinicId: z.string().uuid(),
  recipients: z.array(
    z.object({
      email: z.string().email(),
      patientId: z.string().uuid().optional().nullable()
    })
  ).min(1).max(250),
  subject: z.string().min(3).max(180),
  text: z.string().min(1).max(20000),
  html: z.string().max(50000).optional(),
  template: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
  related_entity_type: z.string().max(80).optional().nullable(),
  related_entity_id: z.string().uuid().optional().nullable()
});

const rateLimit = new Map();

async function sendMessageHandler(req, res, next) {
  try {
    const auth = await authenticate(req);
    assertPermission(auth.role, "canSendMessages");
    checkRateLimit(auth.user.id);

    if (!config.RESEND_API_KEY) {
      return res.status(503).json({ error: "RESEND_NOT_CONFIGURED" });
    }

    const payload = sendSchema.parse(req.body);
    if (auth.role !== "platform_admin" && auth.clinicId !== payload.clinicId) {
      return res.status(403).json({ error: "FORBIDDEN_CLINIC" });
    }

    const uniqueRecipients = dedupeRecipients(payload.recipients);
    const results = [];

    for (const recipient of uniqueRecipients) {
      const logPayload = {
        clinic_id: payload.clinicId,
        patient_id: recipient.patientId ?? null,
        user_id: auth.user.id,
        channel: "email",
        provider: "resend",
        recipient: recipient.email,
        subject: payload.subject,
        body_preview: stripHtml(payload.text).slice(0, 180),
        status: "pending",
        related_entity_type: payload.related_entity_type ?? null,
        related_entity_id: payload.related_entity_id ?? null
      };
      const { data: log, error: logError } = await supabase
        .from("message_logs")
        .insert(logPayload)
        .select("id")
        .single();
      if (logError) throw logError;

      try {
        const sent = await sendWithResend({
          to: recipient.email,
          subject: payload.subject,
          text: payload.text,
          html: payload.html
        });
        await supabase
          .from("message_logs")
          .update({
            status: "sent",
            provider_message_id: sent.id ?? null,
            sent_at: new Date().toISOString()
          })
          .eq("id", log.id);
        results.push({ email: recipient.email, status: "sent", id: sent.id ?? null });
      } catch (error) {
        logger.warn({ err: error, recipient: recipient.email }, "Failed to send email with Resend");
        await supabase
          .from("message_logs")
          .update({
            status: "failed",
            error_message: "No pudimos enviar el email con Resend."
          })
          .eq("id", log.id);
        results.push({ email: recipient.email, status: "failed" });
      }
    }

    res.status(200).json({
      ok: true,
      sent: results.filter((item) => item.status === "sent").length,
      failed: results.filter((item) => item.status === "failed").length,
      results
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "INVALID_PAYLOAD" });
    }
    next(error);
  }
}

messagesRouter.post("/messages/send", sendMessageHandler);
messagesRouter.post("/api/messages/send", sendMessageHandler);

messagesRouter.post("/webhooks/resend", (_req, res) => {
  res.status(202).json({ ok: true, status: "prepared" });
});

messagesRouter.post("/api/webhooks/resend", (_req, res) => {
  res.status(202).json({ ok: true, status: "prepared" });
});

async function authenticate(req) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    error.code = "UNAUTHORIZED";
    throw error;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("Unauthorized");
    authError.statusCode = 401;
    authError.code = "UNAUTHORIZED";
    throw authError;
  }

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

  return {
    user: data.user,
    role: member?.role ?? profile?.role ?? "patient",
    clinicId: member?.clinic_id ?? null
  };
}

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 10;
  const record = rateLimit.get(userId) ?? { count: 0, resetAt: now + windowMs };
  if (record.resetAt < now) {
    rateLimit.set(userId, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (record.count >= max) {
    const error = new Error("Too many requests");
    error.statusCode = 429;
    error.code = "RATE_LIMITED";
    throw error;
  }
  record.count += 1;
  rateLimit.set(userId, record);
}

function dedupeRecipients(recipients) {
  const seen = new Set();
  return recipients.filter((recipient) => {
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
