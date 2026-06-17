import { supabase } from "./supabase.js";

export async function reserveInboundMessage(messageId, fromPhone) {
  const { error } = await supabase.from("ai_message_logs").insert({
    provider: "whatsapp",
    direction: "inbound",
    provider_message_id: messageId,
    from_phone: fromPhone,
    status: "processing"
  });

  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export async function markInboundMessageProcessed(messageId, status, errorMessage = null) {
  await supabase
    .from("ai_message_logs")
    .update({
      status,
      error_message: errorMessage,
      processed_at: new Date().toISOString()
    })
    .eq("provider", "whatsapp")
    .eq("provider_message_id", messageId);
}
