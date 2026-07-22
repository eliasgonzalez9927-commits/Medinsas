import { makeSupabase } from "../../../_lib/supabase.js";
import { allowOnly, handleError } from "../../../_lib/http.js";
import { findAppointmentByToken } from "../_lib.js";

const INACTIVE_STATUSES = ["cancelled", "completed", "attended", "no_show"];

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["POST"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  const token = String(req.query?.token ?? "");
  if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });

  const type = String(req.body?.type ?? "");
  if (!["cancellation", "reschedule"].includes(type)) {
    return res.status(400).json({ error: "INVALID_REQUEST_TYPE" });
  }
  const notes = req.body?.notes ? String(req.body.notes).slice(0, 2000) : null;

  try {
    const result = await findAppointmentByToken(client, token);
    if (result.error) return res.status(404).json({ error: result.error });
    const appointment = result.appointment;

    if (INACTIVE_STATUSES.includes(appointment.status)) {
      return res.status(409).json({ error: "APPOINTMENT_NOT_ACTIVE" });
    }

    const { error: insertError } = await client
      .from("appointment_requests")
      .insert({ appointment_id: appointment.id, type, notes, requested_by: "patient" });
    if (insertError) {
      if (insertError.code === "23505") {
        return res.status(409).json({ error: "DUPLICATE_PENDING_REQUEST" });
      }
      throw insertError;
    }

    return res.status(201).json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}
