const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseEnv = {
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
  isConfigured: Boolean(supabaseUrl && supabasePublishableKey),
} as const;
