import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";
import type { Database } from "./database.types";

export const supabase: SupabaseClient<Database> | null = supabaseEnv.isConfigured
  ? createClient<Database>(supabaseEnv.url, supabaseEnv.publishableKey)
  : null;
