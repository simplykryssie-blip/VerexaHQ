"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plug } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useWorkspace } from "@/components/WorkspaceProvider";
import BrandCenter from "@/components/BrandCenter";
type Providers = { email: boolean; sms: boolean; stripe: boolean };

type WorkspaceSetupState = {
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_website: string | null;
  business_type: string | null;
  primary_service_type: string | null;
  owner_full_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

type TeamMemberRow = {
  id: string;
  role: string;
  member_status: string;
  display_name: string | null;
  job_title: string | null;
  user_id: string;
};

type SubscriptionSummary = {
  plan_name: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  monthly_price: number | null;
};

type GridRow = [string, string | number | null | undefined];

export default function SettingsPage() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const [setup, setSetup] = useState<WorkspaceSetupState | null>(null);
  const [team, setTeam] = useState<TeamMemberRow[]>([]);
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);
  const [providers, setProviders] = useState<Providers>({
    email: false,
    sms: false,
    stripe: false,
  });
  const [tab, setTab] = useState("profile");
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const [s, t, b] = await Promise.all([
      supabase.rpc("get_workspace_setup_state", {
        p_workspace_id: activeWorkspaceId,
      }),
      supabase
        .from("workspace_members")
        .select("id,role,member_status,display_name,job_title,user_id")
        .eq("workspace_id", activeWorkspaceId),
      supabase
        .from("v_workspace_subscription_summary")
        .select("*")
        .eq("workspace_id", activeWorkspaceId)
        .maybeSingle(),
    ]);
    setSetup(s.data as WorkspaceSetupState | null);
    setTeam((t.data as TeamMemberRow[]) ?? []);
    setSub(b.data as SubscriptionSummary | null);
    try {
      const r = await authenticatedFetch("/api/provider-status");
      if (r.ok) setProviders(await r.json());
    } catch {}
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);
  const tabs = ["profile", "branding", "team", "integrations", "subscription"];
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Settings</h1>
      <p className="mt-1 text-sm text-muted">
        Manage your firm, branding, team, providers, and plan.
      </p>
      <div className="mt-6 flex gap-2 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold capitalize ${tab === t ? "border-[#108A64] text-[#108A64]" : "border-transparent text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "profile" && (
          <Panel title="Firm profile">
            <Grid
              rows={[
                ["Business", setup?.business_name || activeWorkspace?.name],
                ["Email", setup?.business_email],
                ["Phone", setup?.business_phone],
                ["Website", setup?.business_website],
                ["Business type", setup?.business_type],
                ["Primary service", setup?.primary_service_type],
                [
                  "Address",
                  [setup?.address_line1, setup?.address_line2, setup?.city, setup?.state, setup?.postal_code]
                    .filter(Boolean)
                    .join(", ") || null,
                ],
                ["Owner", setup?.owner_full_name],
                ["Owner email", setup?.owner_email],
                ["Owner phone", setup?.owner_phone],
              ]}
            />
          </Panel>
        )}
        {tab === "branding" && <BrandCenter />}
        {tab === "team" && (
          <Panel title="Team members">
            {team.length === 0 ? (
              <p className="text-sm text-muted">No team members found.</p>
            ) : (
              team.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between border-b border-line py-3 last:border-0"
                >
                  <div>
                    <div className="font-semibold text-ink">
                      {m.display_name || "Team member"}
                    </div>
                    <div className="text-xs text-muted">
                      {m.job_title || m.member_status}
                    </div>
                  </div>
                  <span className="rounded-full bg-paper px-3 py-1 text-xs font-semibold">
                    {m.role}
                  </span>
                </div>
              ))
            )}
          </Panel>
        )}
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
          <Panel title="Founding Beta">
            <Grid
              rows={[
                ["Plan", sub?.plan_name || "Founding Beta"],
                ["Status", sub?.subscription_status || "Trial"],
                [
                  "Trial ends",
                  sub?.trial_ends_at
                    ? new Date(sub.trial_ends_at).toLocaleDateString()
                    : "—",
                ],
                [
                  "Continuation",
                  sub?.monthly_price
                    ? `$${sub.monthly_price}/month`
                    : "$97/month",
                ],
              ]}
            />
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
