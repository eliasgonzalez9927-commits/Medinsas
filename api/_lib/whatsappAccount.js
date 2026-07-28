import { decryptSecret, encryptSecret } from "./crypto.js";

const GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

// Plantillas estandar definidas por Medin (no las escribe la clinica) -
// cada WABA conectada necesita su propia aprobacion de Meta del mismo
// texto, por eso se suben una vez por clinica apenas se conecta. Los 4
// parametros son siempre los mismos en el mismo orden (coinciden con las
// claves que enqueue_notification_event ya arma en notification_events.metadata):
// {{1}}=patient_name, {{2}}=service_name, {{3}}=appointment_datetime, {{4}}=public_code.
export const WHATSAPP_TEMPLATE_DEFINITIONS = {
  appointment_confirmation: {
    metaTemplateName: "medin_confirmacion_turno",
    category: "UTILITY",
    languageCode: "es_AR",
    bodyText: "Hola {{1}}, tu turno de {{2}} quedo confirmado para el {{3}}. Codigo: {{4}}."
  },
  reminder_24h: {
    metaTemplateName: "medin_recordatorio_24h",
    category: "UTILITY",
    languageCode: "es_AR",
    bodyText: "Hola {{1}}, te recordamos tu turno de {{2}} manana {{3}}. Codigo: {{4}}."
  },
  reminder_2h: {
    metaTemplateName: "medin_recordatorio_2h",
    category: "UTILITY",
    languageCode: "es_AR",
    bodyText: "Hola {{1}}, tu turno de {{2}} es hoy {{3}}. Codigo: {{4}}."
  }
};

export function buildTemplateParams(metadata) {
  return [metadata?.patient_name, metadata?.service_name, metadata?.appointment_datetime, metadata?.public_code].map((value) => String(value ?? "-"));
}

// event_type -> template_key: solo los 3 eventos que tienen sentido como
// WhatsApp (confirmacion + los dos recordatorios que arma el cron de la
// Parte F); el resto de los event_type existentes se sigue mandando solo
// por email/in-app, no todos tienen un mensaje de WhatsApp definido.
export const EVENT_TYPE_TO_TEMPLATE_KEY = {
  appointment_created_patient: "appointment_confirmation",
  appointment_reminder_24h: "reminder_24h",
  appointment_reminder_2h: "reminder_2h"
};

async function graphFetch(path, { method = "GET", body, accessToken } = {}) {
  const response = await fetch(`${GRAPH_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(responseBody?.error?.message ?? "Meta Graph API request failed");
    err.code = "META_ERROR";
    err.statusCode = response.status;
    err.metaResponse = responseBody;
    throw err;
  }
  return responseBody;
}

// El intercambio de codigo de Embedded Signup usa GET con query params
// (distinto del POST de Mercado Pago) - devuelve un access_token que segun
// el tipo puede ser de corta o larga duracion. TODO verificar contra un
// numero real conectado si hace falta refresh explicito (no confirmado
// todavia, igual que el mapeo de campos de ARCA antes de probarlo en vivo).
export async function exchangeEmbeddedSignupCode(code) {
  const url = new URL(`${GRAPH_BASE_URL}/oauth/access_token`);
  url.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  url.searchParams.set("client_secret", process.env.META_APP_SECRET ?? "");
  url.searchParams.set("code", code);
  const response = await fetch(url.toString());
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const err = new Error("Meta code exchange failed");
    err.code = "META_ERROR";
    err.metaResponse = body;
    throw err;
  }
  return body.access_token;
}

export async function getPhoneNumberDetails(phoneNumberId, accessToken) {
  return graphFetch(`/${phoneNumberId}?fields=display_phone_number,verified_name`, { accessToken });
}

export async function getClinicWhatsAppAccessToken(client, clinicId) {
  const sender = await getClinicWhatsAppSender(client, clinicId);
  return sender?.accessToken ?? null;
}

// Para mandar un mensaje hace falta el token Y el phone_number_id (el
// numero "desde" el que se envia) - una sola consulta para los dos en vez
// de dos por separado.
export async function getClinicWhatsAppSender(client, clinicId) {
  const { data: settings, error } = await client
    .from("whatsapp_settings")
    .select("access_token_encrypted, phone_number_id, status")
    .eq("clinic_id", clinicId)
    .maybeSingle();
  if (error) throw error;
  if (!settings?.access_token_encrypted || !settings.phone_number_id || settings.status !== "connected") return null;
  return { accessToken: decryptSecret(settings.access_token_encrypted), phoneNumberId: settings.phone_number_id };
}

export async function connectClinicWhatsApp(client, { clinicId, code, wabaId, phoneNumberId }) {
  const accessToken = await exchangeEmbeddedSignupCode(code);
  const details = await getPhoneNumberDetails(phoneNumberId, accessToken).catch(() => ({}));

  const { data: settings, error } = await client
    .from("whatsapp_settings")
    .upsert(
      {
        clinic_id: clinicId,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: details.display_phone_number ?? null,
        verified_name: details.verified_name ?? null,
        access_token_encrypted: encryptSecret(accessToken),
        status: "connected",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "clinic_id" }
    )
    .select("id, waba_id, phone_number_id, display_phone_number, verified_name, status, connected_at")
    .single();
  if (error) throw error;
  return settings;
}

export async function submitWhatsAppTemplate(client, { clinicId, wabaId, accessToken, templateKey }) {
  const definition = WHATSAPP_TEMPLATE_DEFINITIONS[templateKey];
  if (!definition) {
    const err = new Error(`Plantilla desconocida: ${templateKey}`);
    err.code = "WHATSAPP_UNKNOWN_TEMPLATE";
    throw err;
  }

  const result = await graphFetch(`/${wabaId}/message_templates`, {
    method: "POST",
    accessToken,
    body: {
      name: definition.metaTemplateName,
      language: definition.languageCode,
      category: definition.category,
      components: [{ type: "BODY", text: definition.bodyText }]
    }
  });

  const { error } = await client
    .from("whatsapp_message_templates")
    .upsert(
      {
        clinic_id: clinicId,
        template_key: templateKey,
        meta_template_name: definition.metaTemplateName,
        meta_template_id: result.id ?? null,
        language_code: definition.languageCode,
        category: definition.category.toLowerCase(),
        status: "pending",
        updated_at: new Date().toISOString()
      },
      { onConflict: "clinic_id,template_key" }
    );
  if (error) throw error;
}

export async function sendWhatsAppMessage({ phoneNumberId, accessToken, to, templateKey, params }) {
  const definition = WHATSAPP_TEMPLATE_DEFINITIONS[templateKey];
  if (!definition) {
    const err = new Error(`Plantilla desconocida: ${templateKey}`);
    err.code = "WHATSAPP_UNKNOWN_TEMPLATE";
    throw err;
  }
  return graphFetch(`/${phoneNumberId}/messages`, {
    method: "POST",
    accessToken,
    body: {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: definition.metaTemplateName,
        language: { code: definition.languageCode },
        components: [
          {
            type: "body",
            parameters: params.map((text) => ({ type: "text", text: String(text) }))
          }
        ]
      }
    }
  });
}
