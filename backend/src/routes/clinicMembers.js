import { Router } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export const clinicMembersRouter = Router();

const ASSIGNABLE_ROLES = ["clinic_admin", "admin", "receptionist", "professional"];
const ADMIN_ROLES = ["clinic_admin", "admin"];

const updateRoleSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES)
});

clinicMembersRouter.patch("/api/clinic-members/:id/role", updateRoleHandler);
clinicMembersRouter.patch("/clinic-members/:id/role", updateRoleHandler);

clinicMembersRouter.patch("/api/clinic-members/:id/professional", updateProfessionalHandler);
clinicMembersRouter.patch("/clinic-members/:id/professional", updateProfessionalHandler);

async function updateRoleHandler(req, res, next) {
  try {
    const user = await authenticateUser(req);
    const id = String(req.params.id ?? "");
    const payload = updateRoleSchema.parse(req.body ?? {});

    const { data: target, error: targetError } = await supabase
      .from("clinic_members")
      .select("id, clinic_id, user_id, role, active")
      .eq("id", id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return res.status(404).json({ error: "MEMBER_NOT_FOUND" });

    const allowed = await canManageClinic(user.id, target.clinic_id);
    if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });

    const wasActiveAdmin = target.active && ADMIN_ROLES.includes(target.role);
    const staysAdmin = ADMIN_ROLES.includes(payload.role);

    if (wasActiveAdmin && !staysAdmin && target.user_id === user.id) {
      return res.status(409).json({ error: "SELF_DEMOTION_FORBIDDEN" });
    }

    if (wasActiveAdmin && !staysAdmin) {
      const { count, error: countError } = await supabase
        .from("clinic_members")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", target.clinic_id)
        .eq("active", true)
        .in("role", ADMIN_ROLES)
        .neq("id", target.id);
      if (countError) throw countError;
      if (!count) return res.status(409).json({ error: "CLINIC_WITHOUT_ADMIN" });
    }

    const { data: updated, error: updateError } = await supabase
      .from("clinic_members")
      .update({ role: payload.role, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    res.status(200).json({ ok: true, member: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_PAYLOAD" });
    next(error);
  }
}

const updateProfessionalSchema = z.object({
  professionalId: z.string().uuid().nullable()
});

async function updateProfessionalHandler(req, res, next) {
  try {
    const user = await authenticateUser(req);
    const id = String(req.params.id ?? "");
    const payload = updateProfessionalSchema.parse(req.body ?? {});

    const { data: target, error: targetError } = await supabase
      .from("clinic_members")
      .select("id, clinic_id, user_id, role, active")
      .eq("id", id)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return res.status(404).json({ error: "MEMBER_NOT_FOUND" });

    const allowed = await canManageClinic(user.id, target.clinic_id);
    if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });

    if (payload.professionalId !== null) {
      const { data: professional, error: profError } = await supabase
        .from("professionals")
        .select("id, clinic_id")
        .eq("id", payload.professionalId)
        .maybeSingle();
      if (profError) throw profError;
      if (!professional) return res.status(400).json({ error: "PROFESSIONAL_NOT_FOUND" });
      if (professional.clinic_id !== target.clinic_id) {
        return res.status(400).json({ error: "PROFESSIONAL_CLINIC_MISMATCH" });
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("clinic_members")
      .update({ professional_id: payload.professionalId, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    res.status(200).json({ ok: true, member: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_PAYLOAD" });
    next(error);
  }
}

async function authenticateUser(req) {
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
  return data.user;
}

async function canManageClinic(userId, clinicId) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role === "platform_admin") return true;

  const { data: member, error: memberError } = await supabase
    .from("clinic_members")
    .select("role, active")
    .eq("user_id", userId)
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .maybeSingle();
  if (memberError) throw memberError;
  if (member?.role === "platform_admin") return true;
  return member?.role === "clinic_admin" || member?.role === "admin";
}
