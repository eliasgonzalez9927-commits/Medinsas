import { decryptSecret, encryptSecret } from "./crypto.js";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Mercado Pago OAuth access tokens expire - this resolves the clinic's
// current token, transparently refreshing it first if it's close to
// expiring (or already expired) so callers never have to think about it.
export async function getClinicMercadoPagoAccessToken(client, clinicId) {
  const { data: settings, error } = await client
    .from("payment_settings")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("provider", "mercado_pago")
    .maybeSingle();
  if (error) throw error;
  if (!settings?.access_token_encrypted) return null;

  const expiresAt = settings.token_expires_at ? new Date(settings.token_expires_at).getTime() : 0;
  if (expiresAt && expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    return decryptSecret(settings.access_token_encrypted);
  }
  if (!settings.refresh_token_encrypted) {
    return decryptSecret(settings.access_token_encrypted);
  }

  const refreshed = await refreshAccessToken(decryptSecret(settings.refresh_token_encrypted));
  if (!refreshed) {
    // Refresh failed (refresh token itself expired/revoked) - fall back to
    // the token we have and let Mercado Pago's API reject it explicitly,
    // rather than failing the whole request on our own guess.
    return decryptSecret(settings.access_token_encrypted);
  }

  const nextExpiresAt = new Date(Date.now() + Number(refreshed.expires_in ?? 15552000) * 1000).toISOString();
  const { error: updateError } = await client
    .from("payment_settings")
    .update({
      access_token_encrypted: encryptSecret(refreshed.access_token),
      refresh_token_encrypted: refreshed.refresh_token ? encryptSecret(refreshed.refresh_token) : settings.refresh_token_encrypted,
      token_expires_at: nextExpiresAt,
      updated_at: new Date().toISOString()
    })
    .eq("id", settings.id);
  if (updateError) throw updateError;

  return refreshed.access_token;
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.MERCADO_PAGO_CLIENT_ID,
      client_secret: process.env.MERCADO_PAGO_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  if (!response.ok) return null;
  return response.json();
}
