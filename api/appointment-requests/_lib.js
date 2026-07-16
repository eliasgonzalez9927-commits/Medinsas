const ADMIN_ROLES = ["platform_admin", "clinic_admin", "receptionist", "admin"];

export async function authenticateAdmin(client, req) {
  const header = req.headers?.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return "UNAUTHENTICATED";

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return "UNAUTHENTICATED";

  const { data: member, error: memberError } = await client
    .from("clinic_members")
    .select("clinic_id, role")
    .eq("user_id", data.user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (memberError) throw memberError;

  if (!member?.clinic_id || !ADMIN_ROLES.includes(member.role)) {
    return "FORBIDDEN";
  }

  return { clinicId: member.clinic_id, role: member.role };
}
