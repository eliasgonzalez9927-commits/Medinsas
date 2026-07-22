import { makeSupabase } from "../../../_lib/supabase.js";
import { allowOnly, handleError } from "../../../_lib/http.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES = ["clinic_admin", "receptionist", "professional"];

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["POST"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  try {
    const auth = await authenticatePlatformAdmin(client, req);
    if (auth === "UNAUTHENTICATED") return res.status(401).json({ error: "UNAUTHENTICATED" });
    if (auth === "FORBIDDEN") return res.status(403).json({ error: "PLATFORM_ADMIN_REQUIRED" });

    const clinicId = String(req.query?.clinicId ?? "");
    if (!UUID_RE.test(clinicId)) return res.status(400).json({ error: "INVALID_CLINIC_ID" });

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const fullName = String(req.body?.fullName ?? "").trim();
    const phone = req.body?.phone ? String(req.body.phone).trim() : null;
    const role = ALLOWED_ROLES.includes(req.body?.role) ? req.body.role : "clinic_admin";
    const password = req.body?.password ? String(req.body.password) : null;

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "INVALID_EMAIL" });
    if (fullName.length < 2) return res.status(400).json({ error: "INVALID_FULL_NAME" });
    if (password && password.length < 8) return res.status(400).json({ error: "INVALID_PASSWORD" });

    const { data: clinic, error: clinicError } = await client
      .from("clinics")
      .select("id, name")
      .eq("id", clinicId)
      .maybeSingle();
    if (clinicError) throw clinicError;
    if (!clinic) return res.status(404).json({ error: "CLINIC_NOT_FOUND" });

    const temporaryPassword = password || generateTemporaryPassword();
    const userResult = await createOrFindAuthUser(client, { email, password: temporaryPassword, fullName, phone, role });

    await upsertProfile(client, { userId: userResult.user.id, fullName, phone, role });

    const { data: member, error: memberError } = await client
      .from("clinic_members")
      .upsert(
        {
          clinic_id: clinicId,
          user_id: userResult.user.id,
          role,
          active: true,
          updated_at: new Date().toISOString()
        },
        { onConflict: "clinic_id,user_id" }
      )
      .select("id, clinic_id, user_id, role, active, created_at, updated_at")
      .single();
    if (memberError) throw memberError;

    await client.from("audit_logs").insert({
      clinic_id: clinicId,
      user_id: auth.user.id,
      action: "clinic_admin_added",
      entity_type: "clinic_member",
      entity_id: member.id,
      metadata: { email, role, auth_user_created: userResult.created }
    });

    return res.status(201).json({
      ok: true,
      user: {
        id: userResult.user.id,
        email,
        created: userResult.created,
        temporaryPassword: password ? null : temporaryPassword
      },
      member
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function authenticatePlatformAdmin(client, req) {
  const header = req.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return "UNAUTHENTICATED";

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return "UNAUTHENTICATED";

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const { data: member, error: memberError } = await client
    .from("clinic_members")
    .select("role, active")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;

  const role = member?.role ?? profile?.role;
  if (role !== "platform_admin") return "FORBIDDEN";

  return { user: data.user, role };
}

async function createOrFindAuthUser(client, { email, password, fullName, phone, role }) {
  const { data: created, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, role }
  });
  if (!error && created.user) return { user: created.user, created: true };
  if (!isAlreadyRegisteredError(error)) throw error;

  const existing = await findAuthUserByEmail(client, email);
  if (!existing) throw error;
  return { user: existing, created: false };
}

async function findAuthUserByEmail(client, email) {
  let page = 1;
  const perPage = 100;
  while (page <= 20) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function upsertProfile(client, { userId, fullName, phone, role }) {
  const { error } = await client
    .from("profiles")
    .upsert({ id: userId, full_name: fullName, phone: phone ?? null, role }, { onConflict: "id" });
  if (error) throw error;
}

function isAlreadyRegisteredError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("already") || message.includes("registered") || message.includes("exists");
}

function generateTemporaryPassword() {
  return `Medin.${Math.random().toString(36).slice(2, 8)}.${new Date().getFullYear()}!`;
}
