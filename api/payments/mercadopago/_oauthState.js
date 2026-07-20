import crypto from "node:crypto";

// The OAuth callback (Mercado Pago redirecting the browser back to us) has
// no Authorization header to authenticate the request - the signed "state"
// value round-tripped through Mercado Pago is the only proof that this
// callback corresponds to a connection we actually started, for the clinic
// we started it for. Signed (not just random) so it can't be forged to
// attach someone else's Mercado Pago account to an arbitrary clinic_id.
const TTL_MS = 15 * 60 * 1000;

function getSecret() {
  const secret = process.env.MERCADO_PAGO_CLIENT_SECRET;
  if (!secret) throw new Error("MERCADO_PAGO_CLIENT_SECRET not configured");
  return secret;
}

export function signState({ clinicId, nonce, codeVerifier }) {
  const payload = JSON.stringify({ clinicId, nonce, codeVerifier, exp: Date.now() + TTL_MS });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

// PKCE (RFC 7636): even though this is a confidential client (the token
// exchange happens server-side with client_secret, never in the browser),
// current OAuth best practice recommends PKCE for every client as defense
// in depth against authorization-code interception. code_verifier travels
// inside the signed state (round-tripped via Mercado Pago) since this is a
// stateless serverless function with nowhere else to keep it between the
// start and callback requests.
export function createPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function verifyState(state) {
  const [payloadB64, signature] = String(state ?? "").split(".");
  if (!payloadB64 || !signature) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}
