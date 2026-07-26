"use client";

// Unauthenticated Supabase client for the public tax-intake pages. No
// staff/portal session is ever involved here — the only credential is the
// per-intake return-link token, which every RPC below re-validates itself.
// Session persistence is intentionally off: nothing about an anonymous
// intake taker should be tied to browser-local Supabase auth state.
import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

export const isIntakeSupabaseConfigured = Boolean(
  configuredUrl && configuredKey && configuredUrl.startsWith("https://")
);

const supabaseUrl = configuredUrl || "https://placeholder.supabase.co";
const supabaseKey = configuredKey || "placeholder-anon-key";

export const supabaseIntake = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export type IntakeRow = {
  id: string;
  workspace_id: string;
  service_type: string;
  tax_year: number;
  return_type: string;
  is_returning_client: boolean;
  status: string;
  current_section: number;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_email_verified: boolean;
  contact_phone_verified: boolean;
  answers: Record<string, unknown>;
  review_flags: string[];
  complexity_classification: string;
  consultation_recommended: boolean;
  recommended_package: string | null;
  submitted_at: string | null;
  submitted_version: number | null;
};

export type IntakeDocumentRequest = {
  id: string;
  item_key: string;
  item_title: string;
  item_reason: string;
  is_required: boolean;
  is_blocking: boolean;
  status: string;
  sort_order: number;
};
