"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plug } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useWorkspace } from "@/components/WorkspaceProvider";
import BrandCenter from "@/components/BrandCenter";
import FirmProfilePanel from "@/components/FirmProfilePanel";
import TeamManagementPanel from "@/components/TeamManagementPanel";
type Providers = { email: boolean; sms: boolean; stripe: boolean };

type SubscriptionSummary = {
  plan_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  monthly_price: number | null;
};

type GridRow = [string, string | number | null | undefined];

const SETTINGS_TABS = [
  { key: "profile", label: "Profile" },
  { key: "branding", label: "Branding" },
  { key: "team", label: "Team" },
  { key: "integrations", label: "Integrations" },
  { key: "subscription", label: "Subscription" },
];

export default function SettingsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);
  const [providers, setProviders] = useState<Providers>({
    email: false,
    sms: false,
    stripe: false,
  });
  const [tab, setTab] = useState("profile");
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const { data } = await supabase
      .from("v_workspace_subscription_summary")
      .select("*")
      .eq("workspace_id", activeWorkspaceId)
      .maybeSingle();
    setSub(data as SubscriptionSummary | null);
    try {
      const r = await authenticatedFetch("/api/provider-status");
      if (r.ok) setProviders(await r.json());
    } catch {}
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Manage your firm, branding, team, providers, and plan.
      </p>
      <div className="relative mt-6 border-b border-line">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-px sm:mx-0 sm:px-0">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === t.key ? "border-[#108A64] text-[#108A64]" : "border-transparent text-muted"}`}
            >
              {t.label}
            </button>
          ))}
          <span className="shrink-0 basis-2 sm:hidden" aria-hidden />
        </div>
      </div>
      <div className="mt-5 pb-8">
        {tab === "profile" && <FirmProfilePanel />}
        {tab === "branding" && <BrandCenter />}
        {tab === "team" && <TeamManagementPanel />}
        {tab === "integrations" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Provider
              name="Resend Email"
              ready={providers.email}
              env="RESEND_API_KEY + EMAIL_FROM_ADDRESS"
            />
            <Provider
              name="Twilio SMS"
              ready={providers.sms}
              env="TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER"
            />
            <Provider
              name="Stripe Payments"
              ready={providers.stripe}
              env="STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET"
            />
          </div>
        )}
        {tab === "subscription" && (
          <Panel title={sub?.plan_name || "Subscription"}>
            <Grid
              rows={[
                ["Plan", sub?.plan_name],
                ["Status", sub?.subscription_status],
                [
                  "Continuation price",
                  sub?.monthly_price != null ? `$${sub.monthly_price}/month` : null,
                ],
              ]}
            />
            <div className="mt-3 rounded-xl bg-paper p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">Trial ends</div>
              <div className="mt-1 font-semibold text-ink">{trialEndsDisplay(sub)}</div>
            </div>
            <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              No card is required during the 30-day beta. Paid continuation is
              optional.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-3xl rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-4 font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}
function Grid({ rows }: { rows: GridRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(([a, b]) => (
        <div key={a} className="rounded-xl bg-paper p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            {a}
          </div>
          <div className="mt-1 font-semibold text-ink">{b || "Not added"}</div>
        </div>
      ))}
    </div>
  );
}
function trialEndsDisplay(sub: SubscriptionSummary | null) {
  if (!sub || sub.subscription_status !== "Trial") return "Not applicable";
  if (!sub.trial_ends_at) return "Trial end date is unavailable — contact support so this can be corrected.";
  const end = new Date(sub.trial_ends_at);
  const exact = end.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const daysRemaining = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysRemaining < 0) return `${exact} (trial has ended)`;
  if (daysRemaining === 0) return `${exact} (ends today)`;
  return `${exact} (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining)`;
}
function Provider({
  name,
  ready,
  env,
}: {
  name: string;
  ready: boolean;
  env: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
      >
        {ready ? <CheckCircle2 size={20} /> : <Plug size={20} />}
      </div>
      <h3 className="mt-4 font-bold text-ink">{name}</h3>
      <p className="mt-1 text-sm text-muted">
        {ready
          ? "Connected and ready"
          : "Add the server-side environment variables to connect."}
      </p>
      <div className="mt-3 break-all rounded-lg bg-paper p-2 text-[10px] text-muted">
        {env}
      </div>
    </div>
  );
}
