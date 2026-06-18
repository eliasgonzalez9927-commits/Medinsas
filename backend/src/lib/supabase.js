import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabase = createClient(
  config.SUPABASE_URL || "https://example.supabase.co",
  config.SUPABASE_SERVICE_ROLE_KEY || "not-configured",
  {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
  }
);
