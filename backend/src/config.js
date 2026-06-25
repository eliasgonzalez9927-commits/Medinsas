import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().default("not-configured"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default("v20.0"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().default("Medin <no-reply@medin.local>"),
  RESEND_REPLY_TO_EMAIL: z.string().optional(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().optional(),
  MERCADO_PAGO_PUBLIC_KEY: z.string().optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().optional(),
  MERCADO_PAGO_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  APP_PUBLIC_URL: z.string().url().optional(),
  LANDING_PUBLIC_URL: z.string().url().optional()
});

export const config = envSchema.parse(process.env);
