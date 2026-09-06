import type { SupabaseClient } from "@supabase/supabase-js";

export type Irs8821OrganizerPrefill = {
  taxYearsPeriods: string | null;
  specificTaxMatters: string | null;
};

function answerToText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || null;
  return String(value);
}

// Looks up whatever the client's most recently submitted organizer already
// captured for an 8821 -- if the firm tagged any of that organizer's
// fields with irs_8821_role (same tagging mechanism already used to sync
// spouse/dependent answers into client_relationships) -- so staff creating
// an authorization aren't re-asking the client something already on file.
// Returns nulls (never throws) when there's no submitted organizer or no
// tagged fields; the New IRS Authorization form treats this purely as an
// optional prefill, not a requirement.
export async function getIrs8821OrganizerPrefill(
  supabase: SupabaseClient,
  clientId: string
): Promise<Irs8821OrganizerPrefill> {
  const { data: response } = await supabase
    .from("organizer_responses")
    .select("id")
    .eq("client_id", clientId)
    .in("status", ["submitted", "reviewed"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!response) return { taxYearsPeriods: null, specificTaxMatters: null };

  const { data: answers } = await supabase
    .from("organizer_response_answers")
    .select("value, organizer_fields!inner(irs_8821_role)")
    .eq("organizer_response_id", response.id)
    .not("organizer_fields.irs_8821_role", "is", null);

  let taxYearsPeriods: string | null = null;
  let specificTaxMatters: string | null = null;
  for (const answer of answers ?? []) {
    const fields = (answer as unknown as { organizer_fields: { irs_8821_role: string | null } | { irs_8821_role: string | null }[] }).organizer_fields;
    const role = Array.isArray(fields) ? fields[0]?.irs_8821_role : fields?.irs_8821_role;
    const text = answerToText(answer.value);
    if (role === "tax_years_periods") taxYearsPeriods = text;
    else if (role === "specific_tax_matters") specificTaxMatters = text;
  }

  return { taxYearsPeriods, specificTaxMatters };
}
