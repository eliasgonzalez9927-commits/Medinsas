import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables", {
    hasViteSupabaseUrl: Boolean(supabaseUrl),
    hasViteSupabaseAnonKey: Boolean(supabaseAnonKey)
  });
  throw new Error("Missing Supabase environment variables.");
}

console.info("Supabase client configured", {
  url: supabaseUrl,
  hasAnonKey: Boolean(supabaseAnonKey)
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
