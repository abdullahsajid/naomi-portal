import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Server only. Uses the service-role key, never import this from client components.
let client: SupabaseClient<any> | null = null;

export function db() {
  client ??= createClient<any>(new URL(env("NEXT_PUBLIC_SUPABASE_URL")).origin, env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  return client;
}
