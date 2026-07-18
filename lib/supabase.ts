"use client";

import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(
  configuredUrl &&
  configuredKey &&
  configuredUrl.startsWith("https://") &&
  !configuredKey.includes("replace-with")
);

const supabaseUrl = configuredUrl || "https://placeholder.supabase.co";
const supabaseKey = configuredKey || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
