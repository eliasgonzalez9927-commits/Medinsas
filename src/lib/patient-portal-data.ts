import { supabase } from "./supabase";

export type MyPatientLink = {
  id: string;
  patient_id: string;
  clinic_id: string;
  relationship: "self" | "guardian" | "family_member";
  status: string;
  patients: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    document_number: string | null;
    birth_date: string | null;
    insurance: string | null;
    notes: string | null;
  } | null;
  clinics: { id: string; name: string; slug: string; timezone: string | null } | null;
};

export type MyAppointment = {
  id: string;
  starts_at: string | null;
  end_time: string | null;
  status: string;
  payment_status: string | null;
  payment_required: boolean | null;
  reason: string | null;
  patient_id: string;
  patients: { first_name: string; last_name: string } | null;
  services: { name: string } | null;
  professionals: { name: string; last_name: string } | null;
  clinics: { name: string; address: string | null } | null;
  locations: { address: string } | null;
};

export async function syncPatientUserLinks(): Promise<void> {
  const { error } = await supabase.rpc("sync_patient_user_links");
  if (error) throw error;
}

export async function getMyPatientLinks(): Promise<MyPatientLink[]> {
  const { data, error } = await supabase
    .from("patient_user_links")
    .select("id, patient_id, clinic_id, relationship, status, patients(*), clinics(id, name, slug, timezone)")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MyPatientLink[];
}

export async function getMyAppointments(patientIds: string[]): Promise<MyAppointment[]> {
  if (!patientIds.length) return [];
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, starts_at, end_time, status, payment_status, payment_required, reason, patient_id, patients(first_name, last_name), services(name), professionals(name, last_name), clinics(name, address), locations(address)"
    )
    .in("patient_id", patientIds)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MyAppointment[];
}

export async function updateMyPatientProfile(
  patientId: string,
  updates: Partial<{
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    document_number: string | null;
    birth_date: string | null;
    insurance: string | null;
  }>
): Promise<void> {
  const { error } = await supabase.from("patients").update(updates).eq("id", patientId);
  if (error) throw error;
}

export async function addFamilyMember(input: {
  firstName: string;
  lastName: string;
  documentNumber: string;
  relationship: string;
  birthDate: string;
}): Promise<void> {
  const { error } = await supabase.rpc("add_patient_family_member", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_document_number: input.documentNumber || null,
    p_relationship: input.relationship,
    p_birth_date: input.birthDate || null
  });
  if (error) throw error;
}

export async function createPatientAppointmentRequest(
  appointmentId: string,
  type: "cancellation" | "reschedule",
  notes?: string
): Promise<void> {
  const { error } = await supabase.from("appointment_requests").insert({
    appointment_id: appointmentId,
    type,
    notes: notes ?? null,
    requested_by: "patient"
  });
  if (error) throw error;
}
