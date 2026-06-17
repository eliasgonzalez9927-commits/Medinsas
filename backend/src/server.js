import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
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

app.use(whatsappWebhookRouter);

app.use((error, _req, res, _next) => {
  logger.error({ err: error }, "Unhandled request error");
  res.status(error.statusCode || 500).json({
    error: error.code || "INTERNAL_ERROR"
  });
});

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "Clinic WhatsApp agent listening");
});
