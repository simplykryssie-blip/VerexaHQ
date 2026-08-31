import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { CreditCard } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { EmptyState } from "@/components/EmptyState";
import { PlanUsageManager } from "@/components/settings/PlanUsageManager";
import { BillingCardManager } from "@/components/settings/BillingCardManager";

export const dynamic = "force-dynamic";

export default async function PlanUsagePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: subscription }, { data: meters }, { data: storageFiles }] = await Promise.all([
    supabase
      .from("workspace_subscriptions")
      .select(
        "stripe_status, card_brand, card_last4, card_exp_month, card_exp_year, platform_subscription_plans(name, email_overage_rate_cents, sms_overage_rate_cents, storage_overage_rate_cents)"
      )
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase.from("workspace_usage_meters").select("resource_type, free_units_granted, free_units_consumed, prepaid_balance").eq("workspace_id", workspace.id),
    supabase.from("attachments").select("file_size_bytes").eq("workspace_id", workspace.id).eq("is_archived", false),
  ]);

  const plan = subscription?.platform_subscription_plans as {
    name: string;
    email_overage_rate_cents: number;
    sms_overage_rate_cents: number;
    storage_overage_rate_cents: number;
  } | null;

  const meterByType = new Map((meters ?? []).map((m) => [m.resource_type, m]));
  const storageBytesUsed = (storageFiles ?? []).reduce((sum, f) => sum + (f.file_size_bytes ?? 0), 0);

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={CreditCard}
        title="Plan & Usage"
        description="Your Verexa plan and how much of your included email, text, and storage capacity you've used. Once your free amount runs out, sending and uploads pause until you buy a top-up -- nothing goes out unpaid."
      />

      <div className="mt-6">
        {!subscription || subscription.stripe_status !== "active" || !plan ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState message="This workspace isn't on an active paid plan yet, so usage isn't metered." />
          </div>
        ) : (
          <>
          {workspace.is_owner && (
            <SettingsCard title="Payment method" description="Used for your Verexa subscription and any usage top-ups.">
              <BillingCardManager
                cardBrand={subscription.card_brand}
                cardLast4={subscription.card_last4}
                cardExpMonth={subscription.card_exp_month}
                cardExpYear={subscription.card_exp_year}
              />
            </SettingsCard>
          )}
          <div className="mt-6">
          <SettingsCard title={plan.name} description="Contact Verexa to change plans.">
            <PlanUsageManager
              isOwner={workspace.is_owner}
              emailRateCents={plan.email_overage_rate_cents}
              smsRateCents={plan.sms_overage_rate_cents}
              storageRateCents={plan.storage_overage_rate_cents}
              email={{
                granted: meterByType.get("email")?.free_units_granted ?? 0,
                consumed: meterByType.get("email")?.free_units_consumed ?? 0,
                prepaidBalance: meterByType.get("email")?.prepaid_balance ?? 0,
              }}
              sms={{
                granted: meterByType.get("sms")?.free_units_granted ?? 0,
                consumed: meterByType.get("sms")?.free_units_consumed ?? 0,
                prepaidBalance: meterByType.get("sms")?.prepaid_balance ?? 0,
              }}
              storage={{
                granted: meterByType.get("storage")?.free_units_granted ?? 0,
                prepaidBalance: meterByType.get("storage")?.prepaid_balance ?? 0,
                usedGb: storageBytesUsed / 1073741824,
              }}
            />
          </SettingsCard>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
