import crypto from "node:crypto";
import { makeSupabase } from "../../../_lib/supabase.js";
import { allowOnly, handleError } from "../../../_lib/http.js";
import { signState } from "../_oauthState.js";

// Returns the Mercado Pago authorization URL for the caller's own clinic.
// The frontend does window.location.href = url - a plain link/redirect
// can't carry the Authorization header this needs, so this is a JSON
// endpoint the admin panel calls first, not something Mercado Pago hits
// directly.
export default async function handler(req, res) {
  if (!allowOnly(req, res, ["POST"])) return;

  const { client, error: dbError, missing } = makeSupabase();
  if (dbError) return res.status(500).json({ error: dbError, missing });

  try {
    const auth = await authenticate(client, req);
    if (!auth) return res.status(401).json({ error: "UNAUTHORIZED" });
    if (!["platform_admin", "clinic_admin"].includes(auth.role)) {
      return res.status(403).json({ error: "FORBIDDEN" });
    }
    if (!auth.clinicId) return res.status(400).json({ error: "NO_CLINIC" });

    if (!process.env.MERCADO_PAGO_CLIENT_ID) {
      return res.status(503).json({ error: "MERCADO_PAGO_OAUTH_NOT_CONFIGURED" });
    }

    const appUrl = (process.env.APP_PUBLIC_URL || "https://app.medin.com.ar").replace(/\/$/, "");
    const state = signState({ clinicId: auth.clinicId, nonce: crypto.randomBytes(12).toString("hex") });

    const url = new URL("https://auth.mercadopago.com.ar/authorization");
    url.searchParams.set("client_id", process.env.MERCADO_PAGO_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("platform_id", "mp");
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", `${appUrl}/api/payments/mercadopago/oauth/callback`);

    return res.status(200).json({ url: url.toString() });
  } catch (err) {
    return handleError(res, err);
  }
}

async function authenticate(client, req) {
  const header = req.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: member, error: memberError } = await client
    .from("clinic_members")
    .select("clinic_id, role")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;
  return { clinicId: member?.clinic_id ?? null, role: member?.role ?? null };
}
