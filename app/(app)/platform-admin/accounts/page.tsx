import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Lock, Users2, Mail, Phone } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { WORKSPACE_STATUS_TONE } from "@/lib/workspaceStatus";
import { PlatformAdminTabs } from "../PlatformAdminTabs";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  trialing: "success",
  past_due: "warning",
  unpaid: "danger",
  canceled: "neutral",
};

function money(cents: number | null) {
  if (cents === null) return "--";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
            {rows.map((r) => {
              const fullName = r.display_name ?? ([r.first_name, r.last_name].filter(Boolean).join(" ") || "--");
              return (
                <div key={`${r.workspace_id}-${r.user_id}`} className="rounded-2xl border border-border bg-surface shadow-soft p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-base font-semibold text-ink">{fullName}</p>
                      <p className="text-sm text-slate">{r.workspace_name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} /> {r.email}
                        </span>
                        {r.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone size={12} /> {r.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={WORKSPACE_STATUS_TONE[r.workspace_status] ?? "neutral"} className="capitalize">
                        {r.workspace_status}
                      </Badge>
                      <Link href={`/platform-admin/${r.workspace_id}`} className="text-xs font-medium text-accent hover:underline">
                        View workspace &rarr;
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Plan</p>
                      <p className="mt-0.5 text-slate">{r.plan_name ?? "No plan"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Subscription</p>
                      <p className="mt-0.5">
                        {r.stripe_status ? (
                          <Badge tone={STATUS_TONE[r.stripe_status] ?? "neutral"} className="capitalize">
                            {r.stripe_status}
                          </Badge>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                        {r.cancel_at_period_end && <span className="ml-1.5 text-xs text-warning">(cancelling)</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Seats</p>
                      <p className="mt-0.5 text-slate">{r.seat_count ?? "--"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Renews</p>
                      <p className="mt-0.5 text-slate">
                        {r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : "--"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Last payment</p>
                      <p className="mt-0.5 text-slate">
                        {money(r.last_payment_amount_cents)}
                        {r.last_payment_at && <span className="text-muted"> -- {new Date(r.last_payment_at).toLocaleDateString()}</span>}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted">Customer since</p>
                      <p className="mt-0.5 text-slate">{new Date(r.workspace_created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
