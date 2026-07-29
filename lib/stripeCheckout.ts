import type { SupabaseClient } from "@supabase/supabase-js";

// Thin wrapper around the create_early_access_checkout_session_request RPC
// and the already-deployed, already-verified create-stripe-checkout-session
// Supabase Edge Function (confirmed live via
// platform_edge_function_verification_tests: test_status = "passed",
// blocks_beta = true). This file does not call the Stripe API directly --
// the edge function owns that, matching "do not create duplicate ...
// checkout routes."
export type CheckoutSessionResult =
  | { ok: true; checkoutUrl: string; checkoutRequestId: string }
  | { ok: false; error: string };

export async function createEarlyAccessCheckoutSession(
  supabase: SupabaseClient,
  params: { workspaceId: string; invitationId: string; successUrl: string; cancelUrl: string; email: string | null },
): Promise<CheckoutSessionResult> {
  const { data: requestResult, error: requestError } = await supabase.rpc("create_early_access_checkout_session_request", {
    p_workspace_id: params.workspaceId,
    p_invitation_id: params.invitationId,
    p_success_url: params.successUrl,
    p_cancel_url: params.cancelUrl,
    p_customer_email: params.email,
  });

  if (requestError || !requestResult?.ok) {
    return { ok: false, error: requestResult?.error ?? requestError?.message ?? "Couldn't start checkout." };
  }

  const checkoutRequestId = requestResult.checkout_request_id as string;

  if (requestResult.reused_existing && requestResult.checkout_status === "created") {
    const { data: existing } = await supabase
      .from("workspace_checkout_sessions")
      .select("stripe_checkout_url")
      .eq("id", checkoutRequestId)
      .maybeSingle();
    if (existing?.stripe_checkout_url) {
      return { ok: true, checkoutUrl: existing.stripe_checkout_url as string, checkoutRequestId };
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Server billing credential not configured." };
  }

  let edgeResponse: Response;
  try {
    edgeResponse = await fetch(`${supabaseUrl}/functions/v1/create-stripe-checkout-session`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ checkout_request_id: checkoutRequestId }),
    });
  } catch {
    await supabase.rpc("record_checkout_session_failed", { p_checkout_request_id: checkoutRequestId, p_error_message: "Could not reach the checkout service." });
    return { ok: false, error: "Could not reach the checkout service. Please try again." };
  }

  const edgeResult = (await edgeResponse.json().catch(() => null)) as { ok?: boolean; checkout_url?: string; url?: string; error?: string } | null;
  const checkoutUrl = edgeResult?.checkout_url ?? edgeResult?.url;

  if (!edgeResponse.ok || !edgeResult?.ok || !checkoutUrl) {
    const message = edgeResult?.error ?? "Couldn't create a Stripe checkout session.";
    await supabase.rpc("record_checkout_session_failed", { p_checkout_request_id: checkoutRequestId, p_error_message: message });
    return { ok: false, error: message };
  }

  return { ok: true, checkoutUrl, checkoutRequestId };
}
