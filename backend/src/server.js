import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { mercadoPagoPaymentsRouter } from "./routes/mercadoPagoPayments.js";
import { messagesRouter } from "./routes/messages.js";
import { notificationsRouter } from "./routes/notifications.js";
import { whatsappWebhookRouter } from "./routes/whatsappWebhook.js";
import { config } from "./config.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/health/env", (_req, res) => {
  res.status(200).json({
    mercadoPagoAccessToken: Boolean(config.MERCADO_PAGO_ACCESS_TOKEN),
    mercadoPagoPublicKey: Boolean(config.MERCADO_PAGO_PUBLIC_KEY),
    mercadoPagoWebhookSecret: Boolean(config.MERCADO_PAGO_WEBHOOK_SECRET),
    mercadoPagoEnv: Boolean(config.MERCADO_PAGO_ENV),
    appPublicUrl: Boolean(config.APP_PUBLIC_URL),
    supabaseUrl: Boolean(config.SUPABASE_URL),
    supabaseServiceRoleKey: Boolean(config.SUPABASE_SERVICE_ROLE_KEY),
    resendApiKey: Boolean(config.RESEND_API_KEY),
    resendFromEmail: Boolean(config.RESEND_FROM_EMAIL),
    resendReplyToEmail: Boolean(config.RESEND_REPLY_TO_EMAIL)
  });
});

app.use(whatsappWebhookRouter);
app.use(messagesRouter);
app.use(notificationsRouter);
app.use(mercadoPagoPaymentsRouter);

app.use((error, _req, res, _next) => {
  logger.error({ err: error }, "Unhandled request error");
  res.status(error.statusCode || 500).json({
    error: error.code || "INTERNAL_ERROR"
  });
});

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "Clinic WhatsApp agent listening");
});
