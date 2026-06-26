import { Router } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";

export const superadminRouter = Router();

const createClinicUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  fullName: z.string().min(2).max(160),
  phone: z.string().max(80).optional().nullable(),
  role: z.enum(["clinic_admin", "receptionist", "professional"]).default("clinic_admin")
});

superadminRouter.post("/api/superadmin/clinics/:clinicId/users", async (req, res, next) => {
  try {
    const auth = await authenticatePlatformAdmin(req);
    const clinicId = z.string().uuid().parse(req.params.clinicId);
    const payload = createClinicUserSchema.parse(req.body ?? {});

    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, name")
      .eq("id", clinicId)
      .maybeSingle();
    if (clinicError) throw clinicError;
    if (!clinic) return res.status(404).json({ error: "CLINIC_NOT_FOUND" });

    const temporaryPassword = payload.password || generateTemporaryPassword();
    const userResult = await createOrFindAuthUser({
      email: payload.email,
      password: temporaryPassword,
      fullName: payload.fullName,
      phone: payload.phone,
      role: payload.role
    });

    await upsertProfile({
      userId: userResult.user.id,
      email: payload.email,
      fullName: payload.fullName,
      phone: payload.phone,
      role: payload.role
    });

    const { data: member, error: memberError } = await supabase
      .from("clinic_members")
      .upsert({
        clinic_id: clinicId,
        user_id: userResult.user.id,
        role: payload.role,
        active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "clinic_id,user_id" })
      .select("id, clinic_id, user_id, role, active, created_at, updated_at")
      .single();
    if (memberError) throw memberError;

    await supabase.from("audit_logs").insert({
      clinic_id: clinicId,
      user_id: auth.user.id,
      action: "clinic_admin_added",
      entity_type: "clinic_member",
      entity_id: member.id,
      metadata: {
        email: payload.email,
        role: payload.role,
        auth_user_created: userResult.created
      }
    });

    res.status(201).json({
      ok: true,
      user: {
        id: userResult.user.id,
        email: payload.email,
        created: userResult.created,
        temporaryPassword: payload.password ? null : temporaryPassword
      },
      member
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_PAYLOAD" });
    next(error);
  }
});

async function authenticatePlatformAdmin(req) {
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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const { data: member, error: memberError } = await supabase
    .from("clinic_members")
    .select("role, active")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;

  const role = member?.role ?? profile?.role;
  if (role !== "platform_admin") {
    const forbidden = new Error("Forbidden");
    forbidden.statusCode = 403;
    forbidden.code = "PLATFORM_ADMIN_REQUIRED";
    throw forbidden;
  }

  return { user: data.user, role };
}

async function createOrFindAuthUser({ email, password, fullName, phone, role }) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone,
      role
    }
  });
  if (!error && created.user) return { user: created.user, created: true };
  if (!isAlreadyRegisteredError(error)) throw error;

  const existing = await findAuthUserByEmail(email);
  if (!existing) throw error;
  return { user: existing, created: false };
}

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 100;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function upsertProfile({ userId, email, fullName, phone, role }) {
  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      full_name: fullName,
      phone: phone ?? null,
      role
    }, { onConflict: "id" });
  if (error) throw error;
}

function isAlreadyRegisteredError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("already") || message.includes("registered") || message.includes("exists");
}

function generateTemporaryPassword() {
  return `Medin.${Math.random().toString(36).slice(2, 8)}.${new Date().getFullYear()}!`;
}
