import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "WHATSAPP_ACCESS_TOKEN",
      "SUPABASE_SERVICE_ROLE_KEY",
      "OPENAI_API_KEY"
    ],
    censor: "[redacted]"
  }
});
