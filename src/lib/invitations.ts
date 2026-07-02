import { supabase } from "./supabase";
import { UserRole } from "../types/database";

export type InvitationDetails = {
  valid: true;
  clinicName: string;
  role: UserRole;
  fullName: string;
  email: string;
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

async function optionalAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const headers = await optionalAuthHeader();
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(password ? { password } : {})
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "INVITATION_ACCEPT_FAILED");
  return body as { ok: true; redirectTo: string };
}

export async function cancelInvitation(id: string) {
  const headers = await authHeader();
  const response = await fetch(`/api/invitations/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "INVITATION_CANCEL_FAILED");
  return body as { ok: true; invitation: { id: string; email: string; role: string; status: string; expires_at: string | null } };
}

export async function updateClinicMemberProfessional(
  id: string,
  professionalId: string | null
) {
  const headers = await authHeader();
  const response = await fetch(`/api/clinic-members/${encodeURIComponent(id)}/professional`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ professionalId })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "PROFESSIONAL_UPDATE_FAILED");
  return body as { ok: true; member: Record<string, unknown> };
}

export async function changeClinicMemberRole(
  id: string,
  role: "clinic_admin" | "admin" | "receptionist" | "professional"
) {
  const headers = await authHeader();
  const response = await fetch(`/api/clinic-members/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ role })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "ROLE_CHANGE_FAILED");
  return body as { ok: true; member: Record<string, unknown> };
}
