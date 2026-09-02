import { createClient } from "@/lib/supabase/server";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PlansManager } from "./PlansManager";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPlansPage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Subscription Plans" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins." />
          </div>
        </div>
      </>
    );
  }

  const { data: plans } = await supabase
    .from("platform_subscription_plans")
    .select(
      "id, slug, name, base_price_cents, included_seats, per_seat_price_cents, email_overage_rate_cents, sms_overage_rate_cents, storage_overage_rate_cents, signup_free_emails, signup_free_sms, signup_free_storage_gb, currency, is_active"
    )
    .order("base_price_cents", { ascending: true });

  return (
    <>
      <PageHeader
        backHref="/platform-admin"
        backLabel="Back to all workspaces"
        title="Subscription Plans"
        description="What Verexa charges workspaces to use the platform. Nothing here is billed automatically yet -- assign a plan to a workspace from its detail page."
      />
      <div className="flex-1 px-8 py-6">
        <PlansManager plans={plans ?? []} />
      </div>
    </>
  );
}
