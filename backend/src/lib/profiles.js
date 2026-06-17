import { supabase } from "./supabase.js";
import { normalizePhone } from "./whatsapp.js";

export async function findProfileByPhone(phone) {
  const normalizedPhone = normalizePhone(phone);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role")
    .or(`phone.eq.${normalizedPhone},phone.eq.+${normalizedPhone}`)
    .maybeSingle();

  if (error) throw error;
  return data;
}
