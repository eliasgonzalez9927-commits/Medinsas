import { allowOnly } from "../_lib/http.js";

// Reports whether each env var the app depends on is set in this
// deployment - never the values themselves, just presence. The Mercado
// Pago settings screen uses this to show the admin what's actually
// configured in Vercel instead of a silent failure once they hit "Guardar".
export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET"])) return;

  return res.status(200).json({
    mercadoPagoClientId: Boolean(process.env.MERCADO_PAGO_CLIENT_ID),
    mercadoPagoClientSecret: Boolean(process.env.MERCADO_PAGO_CLIENT_SECRET),
    mercadoPagoWebhookSecret: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
    paymentTokensEncryptionKey: Boolean(process.env.PAYMENT_TOKENS_ENCRYPTION_KEY),
    appPublicUrl: Boolean(process.env.APP_PUBLIC_URL),
    supabaseUrl: Boolean(process.env.SUPABASE_URL),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
}
