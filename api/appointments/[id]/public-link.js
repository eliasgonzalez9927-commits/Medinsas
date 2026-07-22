import crypto from "node:crypto";
import { makeSupabase } from "../../_lib/supabase.js";
import { allowOnly, handleError } from "../../_lib/http.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["POST"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  const appointmentId = String(req.query?.id ?? "");
  if (!UUID_RE.test(appointmentId)) {
    return res.status(400).json({ error: "INVALID_APPOINTMENT_ID" });
  }

  try {
    const { data: appointment, error: fetchError } = await client
      .from("appointments")
      .select("id, public_code")
      .eq("id", appointmentId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!appointment) return res.status(404).json({ error: "APPOINTMENT_NOT_FOUND" });

    const token = await ensurePublicLink(client, appointmentId);
    const publicUrl = (process.env.APP_PUBLIC_URL || `https://${req.headers.host}`).replace(/\/$/, "");

    return res.status(200).json({
      token,
      public_code: appointment.public_code ?? null,
      url: `${publicUrl}/mi-turno/${token}`
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function ensurePublicLink(client, appointmentId) {
  const { data: existing, error: existingError } = await client
    .from("appointment_public_links")
    .select("token, expires_at, revoked_at")
    .eq("appointment_id", appointmentId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) {
    return existing.token;
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const { data, error } = await client
    .from("appointment_public_links")
    .insert({
      appointment_id: appointmentId,
      token,
      expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
    })
    .select("token")
    .single();
  if (error) throw error;
  return data.token;
}
