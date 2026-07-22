import { makeSupabase } from "../../_lib/supabase.js";
import { allowOnly, handleError } from "../../_lib/http.js";
import { findAppointmentByToken } from "./_lib.js";

export default async function handler(req, res) {
  if (!allowOnly(req, res, ["GET"])) return;

  const { client, error, missing } = makeSupabase();
  if (error) return res.status(500).json({ error, missing });

  const token = String(req.query?.token ?? "");
  if (!token) return res.status(400).json({ error: "INVALID_TOKEN" });

  try {
    const result = await findAppointmentByToken(client, token);
    if (result.error) return res.status(404).json({ error: result.error });
    const appointment = result.appointment;

    const { data: payment, error: paymentError } = await client
      .from("payments")
      .select("status, amount, currency, paid_at")
      .eq("appointment_id", appointment.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw paymentError;

    const { data: pendingRequests, error: requestsError } = await client
      .from("appointment_requests")
      .select("type, status, created_at")
      .eq("appointment_id", appointment.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (requestsError) throw requestsError;

    return res.status(200).json(toResponse(appointment, payment, pendingRequests ?? []));
  } catch (err) {
    return handleError(res, err);
  }
}

function toResponse(appointment, payment, pendingRequests) {
  const patient = appointment.patients ?? {};
  const service = appointment.services ?? {};
  const professional = appointment.professionals ?? {};
  const clinic = appointment.clinics ?? {};
  const location = appointment.locations ?? {};
  const requiresOnlinePayment = Boolean(appointment.payment_required);
  const expectedAmount = Number(appointment.deposit_amount ?? service.price ?? 0);

  return {
    appointment: {
      public_code: appointment.public_code ?? null,
      status: appointment.status ?? null,
      payment_status: appointment.payment_status ?? null,
      requires_online_payment: requiresOnlinePayment,
      starts_at: appointment.starts_at ?? null,
      end_time: appointment.end_time ?? null,
      patient_name: [patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Paciente",
      service_name: service.name ?? appointment.reason ?? "Consulta",
      professional_name: [professional.name, professional.last_name].filter(Boolean).join(" ") || "A confirmar",
      clinic_name: clinic.name ?? "Medin",
      timezone: clinic.timezone ?? "America/Argentina/Mendoza",
      clinic_phone: clinic.phone ?? null,
      location_address: location.address ?? clinic.address ?? null,
      duration_minutes: Number(service.duration_minutes ?? 30),
      has_schedule: Boolean(appointment.starts_at)
    },
    payment:
      requiresOnlinePayment && payment
        ? {
            status: payment.status,
            amount: Number(payment.amount ?? 0),
            currency: payment.currency ?? "ARS",
            paid_at: payment.paid_at ?? null,
            payment_type: service.deposit_required ? "deposit" : "full",
            payment_type_label: service.deposit_required ? "Seña" : "Pago completo",
            remaining_amount: Math.max(expectedAmount - Number(payment.amount ?? 0), 0)
          }
        : null,
    pending_requests: pendingRequests.map((request) => ({
      type: request.type,
      status: request.status,
      created_at: request.created_at
    }))
  };
}
