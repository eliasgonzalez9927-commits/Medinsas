import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { supabase } from "../lib/supabase.js";
import { config } from "../config.js";
import { sendInvitationEmail } from "../services/resendEmailService.js";

export const invitationsRouter = Router();

const INVITATION_ROLES = ["clinic_admin", "receptionist", "professional"];
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

const createInvitationSchema = z.object({
  clinicId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().min(2).max(160),
  role: z.enum(INVITATION_ROLES).default("clinic_admin"),
  locationId: z.string().uuid().optional().nullable(),
  professionalId: z.string().uuid().optional().nullable()
});

const acceptInvitationSchema = z.object({
  password: z.string().min(8).optional()
});

invitationsRouter.post("/api/invitations", createInvitationHandler);
invitationsRouter.post("/invitations", createInvitationHandler);

async function createInvitationHandler(req, res, next) {
  try {
    const user = await authenticateUser(req);
    const payload = createInvitationSchema.parse(req.body ?? {});

    const allowed = await canManageClinic(user.id, payload.clinicId);
    if (!allowed) return res.status(403).json({ error: "FORBIDDEN_CLINIC" });

    const { data: clinic, error: clinicError } = await supabase
      .from("clinics")
      .select("id, name")
      .eq("id", payload.clinicId)
      .maybeSingle();
    if (clinicError) throw clinicError;
    if (!clinic) return res.status(404).json({ error: "CLINIC_NOT_FOUND" });

    const { data: existingPending, error: existingError } = await supabase
      .from("user_invitations")
      .select("id")
      .eq("clinic_id", payload.clinicId)
      .eq("email", payload.email)
      .eq("status", "pending")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingPending) return res.status(409).json({ error: "ALREADY_PENDING" });

    if (payload.role === "professional" && !payload.professionalId) {
      return res.status(400).json({ error: "PROFESSIONAL_REQUIRED" });
    }

    if (payload.professionalId) {
      const { data: professional, error: profError } = await supabase
        .from("professionals")
        .select("id, clinic_id")
        .eq("id", payload.professionalId)
        .maybeSingle();
      if (profError) throw profError;
      if (!professional) return res.status(400).json({ error: "PROFESSIONAL_NOT_FOUND" });
      if (professional.clinic_id !== payload.clinicId) {
        return res.status(400).json({ error: "PROFESSIONAL_CLINIC_MISMATCH" });
      }
    }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

    const { data: invitation, error: insertError } = await supabase
      .from("user_invitations")
      .insert({
        clinic_id: payload.clinicId,
        email: payload.email,
        full_name: payload.fullName,
        role: payload.role,
        location_id: payload.locationId ?? null,
        professional_id: payload.professionalId ?? null,
        invited_by: user.id,
        status: "pending",
        token_hash: tokenHash,
        expires_at: expiresAt
      })
      .select("id, email, role, status, expires_at")
      .single();
    if (insertError) throw insertError;

    const invitationUrl = `${resolvePublicUrl()}/aceptar-invitacion?token=${rawToken}`;

    try {
      await sendInvitationEmail({
        to: payload.email,
        fullName: payload.fullName,
        clinicName: clinic.name,
        role: payload.role,
        invitationUrl,
        expiresAt
      });
      await supabase
        .from("user_invitations")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", invitation.id);
    } catch (emailError) {
      // La invitacion ya quedo creada; el email se puede reenviar despues.
      // No se revierte el insert para no perder el token generado.
      req.log?.warn?.({ err: emailError }, "Failed to send invitation email");
    }

    res.status(201).json({ ok: true, invitation });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_PAYLOAD" });
    next(error);
  }
}

invitationsRouter.get("/api/invitations/:token", getInvitationHandler);
invitationsRouter.get("/invitations/:token", getInvitationHandler);

async function getInvitationHandler(req, res, next) {
  try {
    const token = String(req.params.token ?? "");
    if (!token) return res.status(404).json({ error: "INVITATION_NOT_FOUND" });
    const tokenHash = hashToken(token);

    const { data: invitation, error } = await supabase
      .from("user_invitations")
      .select("id, email, full_name, role, status, expires_at, clinics(name)")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (!invitation) return res.status(404).json({ error: "INVITATION_NOT_FOUND" });
    if (invitation.status === "accepted") return res.status(410).json({ error: "INVITATION_ALREADY_USED" });
    if (invitation.status === "cancelled") return res.status(410).json({ error: "INVITATION_CANCELLED" });
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: "INVITATION_EXPIRED" });
    }

    const existingUser = await findAuthUserByEmail(invitation.email);

    res.status(200).json({
      valid: true,
      clinicName: invitation.clinics?.name ?? "Medin",
      role: invitation.role,
      fullName: invitation.full_name,
      email: invitation.email,
      emailHasAccount: Boolean(existingUser),
      expiresAt: invitation.expires_at
    });
  } catch (error) {
    next(error);
  }
}

invitationsRouter.post("/api/invitations/:token/accept", acceptInvitationHandler);
invitationsRouter.post("/invitations/:token/accept", acceptInvitationHandler);

async function acceptInvitationHandler(req, res, next) {
  try {
    const token = String(req.params.token ?? "");
    if (!token) return res.status(404).json({ error: "INVITATION_NOT_FOUND" });
    const payload = acceptInvitationSchema.parse(req.body ?? {});
    const tokenHash = hashToken(token);

    const { data: lookup, error: lookupError } = await supabase
      .from("user_invitations")
      .select("id, email, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!lookup) return res.status(404).json({ error: "INVITATION_NOT_FOUND" });
    if (lookup.status === "accepted") return res.status(410).json({ error: "INVITATION_ALREADY_USED" });
    if (lookup.status === "cancelled") return res.status(410).json({ error: "INVITATION_CANCELLED" });
    if (lookup.expires_at && new Date(lookup.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: "INVITATION_EXPIRED" });
    }

    const existingUser = await findAuthUserByEmail(lookup.email);

    // Una invitacion de clinica nunca debe poder tocar una cuenta existente
    // sin que su dueno este autenticado: el token por si solo no alcanza.
    if (existingUser) {
      const sessionUser = await tryAuthenticateUser(req);
      if (!sessionUser) return res.status(401).json({ error: "LOGIN_REQUIRED" });
      if (sessionUser.email?.toLowerCase() !== lookup.email.toLowerCase()) {
        return res.status(403).json({ error: "EMAIL_MISMATCH" });
      }
    } else if (!payload.password) {
      return res.status(400).json({ error: "PASSWORD_REQUIRED" });
    }

    // Consumo atomico de un solo uso: si otra request ya la acepto entre el
    // lookup y aca, este update no afecta filas.
    const { data: invitation, error: consumeError } = await supabase
      .from("user_invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", lookup.id)
      .eq("status", "pending")
      .select("id, clinic_id, email, full_name, role, location_id, professional_id")
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!invitation) return res.status(410).json({ error: "INVITATION_ALREADY_USED" });

    const userResult = existingUser
      ? { user: existingUser, created: false }
      : await createAuthUser({ email: invitation.email, password: payload.password, fullName: invitation.full_name, role: invitation.role });

    if (!existingUser) {
      // Solo se fija el profile global para una identidad nueva: aceptar una
      // invitacion de clinica nunca debe poder pisar full_name/role de una
      // cuenta que ya existia (eso degrado platform_admin a receptionist).
      await upsertProfile({
        userId: userResult.user.id,
        fullName: invitation.full_name,
        role: invitation.role
      });
    }

    const { error: memberError } = await supabase
      .from("clinic_members")
      .upsert({
        clinic_id: invitation.clinic_id,
        user_id: userResult.user.id,
        role: invitation.role,
        active: true,
        location_id: invitation.location_id ?? null,
        professional_id: invitation.professional_id ?? null,
        updated_at: new Date().toISOString()
      }, { onConflict: "clinic_id,user_id" });
    if (memberError) throw memberError;

    res.status(200).json({ ok: true, redirectTo: "/login" });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_PAYLOAD" });
    next(error);
  }
}

invitationsRouter.post("/api/invitations/:id/cancel", cancelInvitationHandler);
invitationsRouter.post("/invitations/:id/cancel", cancelInvitationHandler);

async function cancelInvitationHandler(req, res, next) {
  try {
    const user = await authenticateUser(req);
    const id = String(req.params.id ?? "");

    const { data: invitation, error: lookupError } = await supabase
      .from("user_invitations")
      .select("id, clinic_id, status")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!invitation) return res.status(404).json({ error: "INVITATION_NOT_FOUND" });

    const allowed = await canManageClinic(user.id, invitation.clinic_id);
    if (!allowed) return res.status(403).json({ error: "FORBIDDEN" });

    if (invitation.status === "accepted") {
      return res.status(409).json({ error: "INVITATION_ALREADY_ACCEPTED" });
    }
    if (invitation.status === "cancelled") {
      return res.status(200).json({ ok: true, invitation });
    }

    const { data: cancelled, error: updateError } = await supabase
      .from("user_invitations")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id, email, role, status, expires_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!cancelled) return res.status(409).json({ error: "INVITATION_ALREADY_ACCEPTED" });

    res.status(200).json({ ok: true, invitation: cancelled });
  } catch (error) {
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

async function tryAuthenticateUser(req) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
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

async function findAuthUserByEmail(email) {
  if (!email) return null;
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

async function createAuthUser({ email, password, fullName, role }) {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });
  if (error) throw error;
  return { user: created.user, created: true };
}

async function upsertProfile({ userId, fullName, role }) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, full_name: fullName, role }, { onConflict: "id" });
  if (error) throw error;
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function resolvePublicUrl() {
  return (config.APP_PUBLIC_URL || "https://clinic-saas-mvp.vercel.app").replace(/\/$/, "");
}
