export async function findAppointmentByToken(client, token) {
  const { data: link, error: linkError } = await client
    .from("appointment_public_links")
    .select("id, appointment_id, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return { error: "LINK_NOT_FOUND" };
  if (link.revoked_at) return { error: "LINK_REVOKED" };
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return { error: "LINK_EXPIRED" };

  const { data: appointment, error: appointmentError } = await client
    .from("appointments")
    .select(
      `id, status, starts_at, end_time, public_code, payment_status, payment_required, deposit_amount, reason,
       patients(first_name, last_name),
       services(name, duration_minutes, price, deposit_required),
       professionals(name, last_name),
       clinics(name, phone, address, timezone),
       locations(address)`
    )
    .eq("id", link.appointment_id)
    .maybeSingle();
  if (appointmentError) throw appointmentError;
  if (!appointment) return { error: "APPOINTMENT_NOT_FOUND" };

  return { appointment };
}
