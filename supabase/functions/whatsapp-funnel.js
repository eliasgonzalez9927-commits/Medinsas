// Supabase Edge Function compatible structure.
// For Supabase Deno runtime, replace process.env with Deno.env.get and deploy as index.ts/js.

const WHATSAPP_PROVIDER_URL =
  process.env.WHATSAPP_PROVIDER_URL || "https://graph.facebook.com/v20.0/{phone-number-id}/messages";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";

const templates = {
  appointment_confirmed: ({ patientName, startsAt }) =>
    `Hola ${patientName}, tu turno fue confirmado para ${startsAt}. Responde 1 para confirmar asistencia.`,
  reminder_24h: ({ patientName, startsAt }) =>
    `Hola ${patientName}, te recordamos tu turno de manana a las ${startsAt}. Si necesitas reprogramar, responde este mensaje.`,
  post_attended_followup: ({ patientName }) =>
    `Hola ${patientName}, gracias por atenderte con nosotros. Podemos ayudarte con un control o tratamiento complementario?`
};

async function sendWhatsAppMessage({ to, message }) {
  const response = await fetch(WHATSAPP_PROVIDER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message }
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`WhatsApp provider error: ${details}`);
  }

  return response.json();
}

function selectAutomation({ eventType, appointment }) {
  if (eventType === "appointment.status_changed" && appointment.status === "confirmed") {
    return "appointment_confirmed";
  }

  if (eventType === "appointment.reminder_24h") {
    return "reminder_24h";
  }

  if (eventType === "appointment.status_changed" && appointment.status === "attended") {
    return "post_attended_followup";
  }

  return null;
}

function formatStartsAt(value) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export async function handleWhatsappFunnel(request) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const payload = await request.json();
  const automationKey = selectAutomation(payload);

  if (!automationKey) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const appointment = payload.appointment;
  const patient = payload.patient;
  const message = templates[automationKey]({
    patientName: patient.full_name,
    startsAt: formatStartsAt(appointment.starts_at)
  });

  const result = await sendWhatsAppMessage({
    to: patient.phone,
    message
  });

  return new Response(
    JSON.stringify({
      sent: true,
      automationKey,
      providerMessageId: result.messages?.[0]?.id ?? null
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}

export default handleWhatsappFunnel;
