import { createClient } from "@/lib/supabase/server";
import { PublicPartnerOnboarding, type PublicPartnerOnboardingData } from "@/components/partner/PublicPartnerOnboarding";

export const dynamic = "force-dynamic";

// The connection-scoped public onboarding link ({{partner_application_link}}
// / {{partner_agreement_link}} in automation emails) -- works for ANY
// workspace's Firm Connection, not just one tenant's. Scoped strictly by
// partner_onboardings.public_token via get_public_partner_onboarding; see
// that RPC for why this is never a shared template token or a client
// identity lookup.
export default async function PartnerApplyPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_public_partner_onboarding", { p_token: params.token });

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This link isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been turned off, or the link is incorrect.</p>
      </div>
    );
  }

  return <PublicPartnerOnboarding token={params.token} data={data as unknown as PublicPartnerOnboardingData} />;
}
