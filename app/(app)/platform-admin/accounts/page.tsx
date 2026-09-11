import { createClient } from "@/lib/supabase/server";
import { Lock, Users2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PlatformAdminTabs } from "../PlatformAdminTabs";
import { AccountHolderCard } from "./AccountHolderCard";

export const dynamic = "force-dynamic";

export default async function PlatformAccountsPage() {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  if (!isPlatformAdmin) {
    return (
      <>
        <PageHeader title="Accounts" />
        <div className="flex-1 px-8 py-6">
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Lock} message="This area is only available to Verexa platform admins." />
          </div>
        </div>
      </>
    );
  }

  const { data: accounts } = await supabase.rpc("get_platform_account_holders");
  const rows = accounts ?? [];

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Every real customer account holder -- who they are, what they're on, and their billing history at a glance."
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <PlatformAdminTabs active="accounts" />

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState icon={Users2} message="No customer accounts yet." />
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((r) => (
              <AccountHolderCard key={`${r.workspace_id}-${r.user_id}`} row={r} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
