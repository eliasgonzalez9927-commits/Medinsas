import { makeSupabase } from "../../../_lib/supabase.js";
import { encryptSecret } from "../../../_lib/crypto.js";
import { verifyState } from "../_oauthState.js";

// Mercado Pago redirects the clinic's browser here after they authorize
// (or deny) the connection. No Authorization header is available on a
// top-level redirect - the signed state value is what proves this
// callback belongs to a connection attempt we actually started, and for
// which clinic. Always ends in a redirect back to the admin panel, never
// a raw JSON response, since a real browser lands here.
export default async function handler(req, res) {
  const appUrl = (process.env.APP_PUBLIC_URL || "https://app.medin.com.ar").replace(/\/$/, "");
  const finish = (status) => {
    res.writeHead(302, { Location: `${appUrl}/admin/pagos/configuracion?mp_connect=${status}` });
    res.end();
  };

  const { code, state, error: mpError } = req.query ?? {};
  if (mpError) return finish("denied");
  if (!code || !state) return finish("invalid");

  let payload;
  try {
    payload = verifyState(state);
  } catch {
    return finish("error");
  }
  if (!payload?.clinicId) return finish("invalid");

  const { client, error: dbError } = makeSupabase();
  if (dbError) return finish("error");

  try {
    const redirectUri = `${appUrl}/api/payments/mercadopago/oauth/callback`;
    const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.MERCADO_PAGO_CLIENT_ID,
        client_secret: process.env.MERCADO_PAGO_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: payload.codeVerifier
      })
    });
    const tokenBody = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenBody.access_token) {
      console.error("Mercado Pago OAuth token exchange failed", tokenBody);
      return finish("failed");
    }

    const expiresAt = new Date(Date.now() + Number(tokenBody.expires_in ?? 15552000) * 1000).toISOString();

    const { error: upsertError } = await client.from("payment_settings").upsert(
      {
        clinic_id: payload.clinicId,
        provider: "mercado_pago",
        active: true,
        access_token_encrypted: encryptSecret(tokenBody.access_token),
        refresh_token_encrypted: tokenBody.refresh_token ? encryptSecret(tokenBody.refresh_token) : null,
        public_key: tokenBody.public_key ?? null,
        mp_user_id: tokenBody.user_id ? String(tokenBody.user_id) : null,
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "clinic_id,provider" }
    );
    if (upsertError) throw upsertError;

    return finish("success");
  } catch (err) {
    console.error("Mercado Pago OAuth callback failed", err);
    return finish("error");
  }
}
