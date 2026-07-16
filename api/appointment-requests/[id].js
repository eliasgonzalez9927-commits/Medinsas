import { makeSupabase } from "../_lib/supabase.js";
import { allowOnly, handleError } from "../_lib/http.js";
import { authenticateAdmin } from "./_lib.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_TO_STATUS = {
  approve_cancellation: "approved",
  reject: "rejected",
  mark_managed: "managed"
};

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["PATCH"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  const requestId = String(req.query?.id ?? "");
  if (!UUID_RE.test(requestId)) {
    return res.status(400).json({ error: "INVALID_REQUEST_ID" });
  }

  const action = req.body?.action;
  const nextStatus = ACTION_TO_STATUS[action];
  if (!nextStatus) {
    return res.status(400).json({ error: "INVALID_ACTION" });
  }

  try {
    const auth = await authenticateAdmin(client, req);
    if (auth === "UNAUTHENTICATED") return res.status(401).json({ error: "UNAUTHENTICATED" });
    if (auth === "FORBIDDEN") return res.status(403).json({ error: "FORBIDDEN" });

    const { data: existing, error: fetchError } = await client
      .from("appointment_requests")
      .select("id, type, status, appointment_id, appointments!inner(id, clinic_id)")
      .eq("id", requestId)
      .eq("appointments.clinic_id", auth.clinicId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
    if (existing.status !== "pending") {
      return res.status(409).json({ error: "REQUEST_ALREADY_RESOLVED" });
    }
    if (action === "approve_cancellation" && existing.type !== "cancellation") {
      return res.status(400).json({ error: "ACTION_NOT_ALLOWED_FOR_TYPE" });
    }
    if (action === "mark_managed" && existing.type !== "reschedule") {
      return res.status(400).json({ error: "ACTION_NOT_ALLOWED_FOR_TYPE" });
    }

    const { error: updateError } = await client
      .from("appointment_requests")
      .update({ status: nextStatus })
      .eq("id", requestId);
    if (updateError) throw updateError;

    if (action === "approve_cancellation") {
      const { error: appointmentError } = await client
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", existing.appointment_id)
        .eq("clinic_id", auth.clinicId);
      if (appointmentError) throw appointmentError;
    }

    return res.status(200).json({ ok: true, status: nextStatus });
  } catch (err) {
    return handleError(res, err);
  }
}
