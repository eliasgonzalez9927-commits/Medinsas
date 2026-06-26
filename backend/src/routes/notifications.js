import { Router } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { assertPermission } from "../security/permissions.js";
import { processPendingEmailDeliveries } from "../services/resendEmailService.js";

export const notificationsRouter = Router();

const processSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

notificationsRouter.post("/api/notifications/process-email-deliveries", async (req, res, next) => {
  try {
    const auth = await authenticate(req);
    assertPermission(auth.role, "canManageClinic");
    if (auth.role !== "platform_admin") {
      return res.status(403).json({ error: "PLATFORM_ADMIN_REQUIRED" });
    }
    const payload = processSchema.parse(req.body ?? {});
    const result = await processPendingEmailDeliveries({ limit: payload.limit });
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_PAYLOAD" });
    next(error);
  }
});

async function authenticate(req) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    error.code = "UNAUTHORIZED";
    throw error;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("Unauthorized");
    authError.statusCode = 401;
    authError.code = "UNAUTHORIZED";
    throw authError;
  }

  const { data: member, error: memberError } = await supabase
    .from("clinic_members")
    .select("clinic_id, role, active")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  return {
    user: data.user,
    role: member?.role ?? profile?.role ?? "patient",
    clinicId: member?.clinic_id ?? null
  };
}
