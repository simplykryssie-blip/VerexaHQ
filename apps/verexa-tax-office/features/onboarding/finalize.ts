import { createClient } from "@/lib/supabase/client";
import { setSelectedWorkspaceAction } from "@/lib/auth/actions";
import type { OnboardingState } from "./types";

export async function finalizeOnboarding(state: OnboardingState): Promise<{ error: string | null }> {
  const supabase = createClient();

  if (!state.workspaceType) return { error: "Please choose a workspace type." };
  if (!state.officeName.trim()) return { error: "Office name is required." };

  const settings = {
    timezone: state.timezone,
    preferred_language: state.preferredLanguage,
    default_tax_year: state.defaultTaxYear,
    address: {
      line1: state.addressLine1,
      line2: state.addressLine2,
      city: state.city,
      state: state.state,
      postal_code: state.postalCode,
    },
    branding: { primary_color: state.primaryColor },
  };

  const { data: workspace, error: workspaceError } = await supabase.rpc("create_workspace_with_owner", {
    p_name: state.officeName.trim(),
    p_workspace_type: state.workspaceType,
    p_legal_name: state.legalName || undefined,
    p_dba_name: state.dbaName || undefined,
    p_email: state.email || undefined,
    p_phone: state.phone || undefined,
    p_website: state.website || undefined,
    p_settings: settings,
    p_plan_code: state.planCode,
  });

  if (workspaceError || !workspace) {
    return { error: workspaceError?.message || "Could not create your workspace. Please try again." };
  }

  const workspaceId = (workspace as { id: string }).id;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { error: profileError } = await supabase.from("professional_profiles").upsert(
      {
        user_id: user.id,
        credential_type: state.credentialType || null,
        ptin_last4: state.ptinLast4 || null,
        is_ero: state.isEro,
        states_served: state.statesServed,
        legal_name: state.legalName || null,
      },
      { onConflict: "user_id" },
    );
    if (profileError) {
      // Non-fatal — the workspace itself was created successfully; the
      // professional profile can be completed later from Settings.
      console.error("[onboarding] professional_profiles upsert", profileError);
    }
  }

  if (state.selectedServices.length > 0) {
    const rows = state.selectedServices.map((name) => ({ workspace_id: workspaceId, name, status: "active" }));
    const { error: servicesError } = await supabase.from("services").insert(rows);
    if (servicesError) {
      console.error("[onboarding] services insert", servicesError);
    }
  }

  await setSelectedWorkspaceAction(workspaceId);

  return { error: null };
}
