import { supabase } from "./supabase";
import { UserRole } from "../types/database";

export type InvitationDetails = {
  valid: true;
  clinicName: string;
  role: UserRole;
  fullName: string;
  emailHasAccount: boolean;
  expiresAt: string;
};

export type CreateInvitationPayload = {
  clinicId: string;
  email: string;
  fullName: string;
  role: "clinic_admin" | "receptionist" | "professional";
  locationId?: string | null;
  professionalId?: string | null;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("UNAUTHORIZED");
  return { Authorization: `Bearer ${token}` };
}

export async function createInvitation(payload: CreateInvitationPayload) {
  const headers = await authHeader();
  const response = await fetch("/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "INVITATION_CREATE_FAILED");
  return body.invitation as { id: string; email: string; role: string; status: string; expires_at: string };
}

export async function getInvitation(token: string): Promise<InvitationDetails> {
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "INVITATION_NOT_FOUND");
  return body as InvitationDetails;
}

export async function acceptInvitation(token: string, password?: string) {
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(password ? { password } : {})
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "INVITATION_ACCEPT_FAILED");
  return body as { ok: true; redirectTo: string };
}
