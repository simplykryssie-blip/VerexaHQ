"use client";

import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const supabaseUrl = configuredUrl || "https://placeholder.supabase.co";
const supabaseKey = configuredKey || "placeholder-anon-key";

export const supabasePortal = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "verexa-portal-auth",
  },
});
