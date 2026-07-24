import { supabase } from "./supabase";
import { FriendlyDataError } from "./clinic-data";
import {
  ClinicNotificationSettings,
  InAppNotification,
  NotificationAudience,
  NotificationDelivery,
  NotificationEvent,
  NotificationTemplate
} from "../types/clinic";

// A que pantalla llevar al hacer click en cada tipo de notificacion in-app.
const EVENT_TYPE_LINKS: Record<string, string> = {
  reschedule_requested_clinic: "/admin/solicitudes",
  cancellation_requested_clinic: "/admin/solicitudes",
  new_booking_clinic: "/admin/agenda",
  manual_booking_clinic: "/admin/agenda",
  overbooking_created_clinic: "/admin/agenda",
  payment_approved_clinic: "/admin/pagos"
};

export function resolveNotificationLink(eventType: string): string {
  return EVENT_TYPE_LINKS[eventType] ?? "/admin";
}

// Trae las notificaciones in-app de la clinica (para la campanita). No
// depende de una tabla nueva: usa el mismo pipeline de eventos/deliveries
// que ya alimentan la pagina de auditoria de envios, filtrado a channel
// in_app y audiencia clinica.
export async function getInAppNotifications(clinicId: string, limit = 30): Promise<InAppNotification[]> {
  try {
    const { data, error } = await supabase
      .from("notification_deliveries")
      .select("id, read_at, notification_events!inner(id, event_type, title, message, created_at, metadata, clinic_id, audience)")
      .eq("clinic_id", clinicId)
      .eq("channel", "in_app")
      .eq("recipient_type", "clinic_user")
      .order("created_at", { referencedTable: "notification_events", ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as any[]).map((row) => ({
      delivery_id: row.id,
      event_id: row.notification_events.id,
      event_type: row.notification_events.event_type,
      title: row.notification_events.title,
      message: row.notification_events.message,
      created_at: row.notification_events.created_at,
      read_at: row.read_at,
      metadata: row.notification_events.metadata ?? {}
    }));
  } catch (error) {
    console.error("Failed to load in-app notifications", error);
    return [];
  }
}

export async function markNotificationRead(deliveryId: string): Promise<void> {
  const { error } = await supabase
    .from("notification_deliveries")
    .update({ read_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .is("read_at", null);
  if (error) console.error("Failed to mark notification as read", error);
}

export async function markAllNotificationsRead(clinicId: string): Promise<void> {
  const { error } = await supabase
    .from("notification_deliveries")
    .update({ read_at: new Date().toISOString() })
    .eq("clinic_id", clinicId)
    .eq("channel", "in_app")
    .is("read_at", null);
  if (error) console.error("Failed to mark all notifications as read", error);
}

export type NotificationEventPayload = {
  clinic_id?: string | null;
  patient_id?: string | null;
  appointment_id?: string | null;
  payment_id?: string | null;
  event_type: string;
  audience: NotificationAudience;
  title: string;
  message?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type NotificationSettingsInput = Partial<
  Pick<
    ClinicNotificationSettings,
    | "email_enabled"
    | "whatsapp_enabled"
    | "in_app_enabled"
    | "reminder_24h_enabled"
    | "reminder_2h_enabled"
    | "notify_new_booking"
    | "notify_payment_approved"
    | "notify_reschedule_requests"
    | "notify_cancellation_requests"
    | "whatsapp_phone_number"
  >
>;

export async function getNotificationEvents(clinicId: string, status = "all"): Promise<NotificationEvent[]> {
  try {
    let query = supabase
      .from("notification_events")
      .select("*, patients(id, first_name, last_name, phone, email), appointments(id, public_code, starts_at, status), notification_deliveries(*)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as NotificationEvent[];
  } catch (error) {
    console.error("Failed to load notification events", error);
    throw new FriendlyDataError("No pudimos cargar las notificaciones.");
  }
}

export async function getClinicNotificationSettings(clinicId: string): Promise<ClinicNotificationSettings | null> {
  try {
    const { data, error } = await supabase
      .from("clinic_notification_settings")
      .select("*")
      .eq("clinic_id", clinicId)
      .maybeSingle();
    if (error) throw error;
    return data as ClinicNotificationSettings | null;
  } catch (error) {
    console.error("Failed to load notification settings", error);
    throw new FriendlyDataError("No pudimos cargar la configuración de notificaciones.");
  }
}

export async function updateClinicNotificationSettings(
  clinicId: string,
  input: NotificationSettingsInput
): Promise<ClinicNotificationSettings> {
  try {
    const { data, error } = await supabase
      .from("clinic_notification_settings")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("clinic_id", clinicId)
      .select("*")
      .single();
    if (error) throw error;
    return data as ClinicNotificationSettings;
  } catch (error) {
    console.error("Failed to update notification settings", error);
    throw new FriendlyDataError("No pudimos guardar la configuración de notificaciones.");
  }
}

export async function createNotificationEvent(payload: NotificationEventPayload): Promise<NotificationEvent | null> {
  try {
    const { data, error } = await supabase
      .from("notification_events")
      .insert({
        ...payload,
        status: payload.status ?? "pending",
        metadata: payload.metadata ?? {}
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as NotificationEvent;
  } catch (error) {
    console.error("Notification event skipped", error);
    return null;
  }
}

export async function createInAppDelivery(event: NotificationEvent): Promise<NotificationDelivery | null> {
  return createDelivery(event, {
    channel: "in_app",
    recipient_type: resolveRecipientType(event.audience),
    status: "pending",
    provider: "medin"
  });
}

export async function createEmailDelivery(event: NotificationEvent): Promise<NotificationDelivery | null> {
  return createDelivery(event, {
    channel: "email",
    recipient_type: resolveRecipientType(event.audience),
    status: "pending",
    provider: "resend"
  });
}

export async function createWhatsAppDelivery(event: NotificationEvent): Promise<NotificationDelivery | null> {
  const settings = event.clinic_id ? await getClinicNotificationSettings(event.clinic_id).catch(() => null) : null;
  return createDelivery(event, {
    channel: "whatsapp",
    recipient_type: resolveRecipientType(event.audience),
    status: settings?.whatsapp_enabled ? "pending" : "skipped",
    provider: "whatsapp_future",
    error_message: settings?.whatsapp_enabled ? null : "WhatsApp automático todavía no está activo."
  });
}

export async function getNotificationTemplate(key: string): Promise<NotificationTemplate | null> {
  try {
    const { data, error } = await supabase
      .from("notification_templates")
      .select("*")
      .eq("key", key)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    return data as NotificationTemplate | null;
  } catch (error) {
    console.error("Failed to load notification template", error);
    return null;
  }
}

export function renderTemplate(template: string, variables: Record<string, string | number | null | undefined>) {
  return Object.entries(variables).reduce((content, [key, value]) => {
    return content.split(`{{${key}}}`).join(value == null ? "" : String(value));
  }, template);
}

async function createDelivery(
  event: NotificationEvent,
  payload: Pick<NotificationDelivery, "channel" | "recipient_type" | "status" | "provider"> &
    Partial<Pick<NotificationDelivery, "recipient_name" | "recipient_email" | "recipient_phone" | "error_message">>
): Promise<NotificationDelivery | null> {
  try {
    const { data, error } = await supabase
      .from("notification_deliveries")
      .insert({
        event_id: event.id,
        clinic_id: event.clinic_id,
        metadata: event.metadata ?? {},
        ...payload
      })
      .select("*")
      .single();
    if (error) throw error;
    return data as NotificationDelivery;
  } catch (error) {
    console.error("Notification delivery skipped", error);
    return null;
  }
}

function resolveRecipientType(audience: string) {
  if (audience === "patient") return "patient";
  if (audience === "platform") return "platform_user";
  return "clinic_user";
}
