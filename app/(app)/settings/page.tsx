"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plug } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import BrandCenter from "@/components/BrandCenter";
import FirmProfilePanel from "@/components/FirmProfilePanel";
import TeamManagementPanel from "@/components/TeamManagementPanel";
type Providers = { email: boolean; sms: boolean; stripe: boolean };

type SubscriptionSummary = {
  plan_name: string | null;
  subscription_status: string | null;
  provider_status: string | null;
  trial_ends_at: string | null;
  stripe_trial_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  canceled_at: string | null;
  payment_method_on_file: boolean | null;
  card_brand: string | null;
  card_last4: string | null;
  activation_block_reason: string | null;
  has_billing_account: boolean | null;
  monthly_price: number | null;
};

// Maps Stripe's own subscription status (workspace_subscriptions.provider_status,
// written only by the customer.subscription.* webhook handlers) to the exact
// provider-state labels the beta feedback called for. Never a status the
// client submits -- always what the last confirmed webhook recorded.
function providerStateLabel(sub: SubscriptionSummary | null): string {
  if (!sub?.has_billing_account) return "Setup incomplete";
  switch (sub.provider_status) {
    case "trialing":
      return "Trialing";
    case "active":
      return "Active";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "unpaid":
      return "Payment failed";
    case "incomplete_expired":
      return "Setup incomplete";
    case "incomplete":
      return "Incomplete";
    default:
      return sub.subscription_status || "Setup incomplete";
  }
}

type GridRow = [string, string | number | null | undefined];

const SETTINGS_TABS = [
  { key: "profile", label: "Profile" },
  { key: "branding", label: "Branding" },
  { key: "team", label: "Team" },
  { key: "integrations", label: "Integrations" },
  { key: "subscription", label: "Subscription" },
];

export default function SettingsPage() {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showError, showSuccess } = useToast();
  const [sub, setSub] = useState<SubscriptionSummary | null>(null);
  const [providers, setProviders] = useState<Providers>({
    email: false,
    sms: false,
    stripe: false,
  });
  const [tab, setTab] = useState("profile");
  const [billingActionPending, setBillingActionPending] = useState<
    "cancel" | "resume" | "update-payment-method" | "finish-setup" | null
  >(null);
  const isOwner = (activeWorkspace?.role || "").toLowerCase() === "owner";
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

  async function runBillingAction(
    action: "cancel" | "resume" | "update-payment-method" | "finish-setup",
  ) {
    if (!activeWorkspaceId || billingActionPending) return;
    setBillingActionPending(action);
    try {
      if (action === "update-payment-method") {
        const r = await authenticatedFetch("/api/stripe/create-setup-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: activeWorkspaceId }),
        });
        const result = await r.json().catch(() => null);
        if (!result?.ok || !result.checkoutUrl) {
          showError(result?.error || "Couldn't start the payment method update.");
          return;
        }
        window.location.href = result.checkoutUrl;
        return;
      }
      if (action === "finish-setup") {
        const r = await authenticatedFetch("/api/early-access/checkout/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: activeWorkspaceId }),
        });
        const result = await r.json().catch(() => null);
        if (!result?.ok || !result.checkoutUrl) {
          showError(result?.error || "Couldn't resume billing setup.");
          return;
        }
        window.location.href = result.checkoutUrl;
        return;
      }
      const r = await authenticatedFetch("/api/stripe/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspaceId, resume: action === "resume" }),
      });
      const result = await r.json().catch(() => null);
      if (!result?.ok) {
        showError(result?.error || "Couldn't update the subscription.");
        return;
      }
      showSuccess(
        action === "resume"
          ? "Your subscription will continue as scheduled."
          : "Your subscription will end after the current period. You can resume any time before then.",
      );
      await load();
    } catch {
      showError("Something went wrong. Please try again.");
    } finally {
      setBillingActionPending(null);
    }
  }

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
                ["Status", providerStateLabel(sub)],
                [
                  "Continuation price",
                  sub?.monthly_price != null ? `$${sub.monthly_price}/month` : null,
                ],
                ["Card on file", cardDisplay(sub)],
                ["Upcoming billing date", upcomingBillingDateDisplay(sub)],
              ]}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-paper p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Trial start</div>
                <div className="mt-1 font-semibold text-ink">{dateOnlyDisplay(sub?.stripe_trial_start)}</div>
              </div>
              <div className="rounded-xl bg-paper p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-muted">Trial ends</div>
                <div className="mt-1 font-semibold text-ink">{trialEndsDisplay(sub)}</div>
              </div>
            </div>

            {sub?.activation_block_reason && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {sub.activation_block_reason}
              </p>
            )}

            {sub?.cancel_at_period_end && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Your subscription is set to end{sub.current_period_end ? ` on ${dateOnlyDisplay(sub.current_period_end)}` : ""}. You can
                resume it any time before then.
              </p>
            )}

            {!sub?.has_billing_account && (
              <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                No card is required during the beta trial. Paid continuation is optional.
              </p>
            )}

            {isOwner && (
              <div className="mt-5 flex flex-wrap gap-3">
                {!sub?.has_billing_account && (
                  <BillingActionButton
                    label="Finish billing setup"
                    pending={billingActionPending === "finish-setup"}
                    disabled={!!billingActionPending}
                    onClick={() => runBillingAction("finish-setup")}
                  />
                )}
                {sub?.has_billing_account && (
                  <BillingActionButton
                    label="Update payment method"
                    pending={billingActionPending === "update-payment-method"}
                    disabled={!!billingActionPending}
                    onClick={() => runBillingAction("update-payment-method")}
                  />
                )}
                {sub?.has_billing_account && sub.subscription_status !== "Canceled" && sub.subscription_status !== "Expired" && (
                  <BillingActionButton
                    label={sub.cancel_at_period_end ? "Resume subscription" : "Cancel subscription"}
                    pending={billingActionPending === (sub.cancel_at_period_end ? "resume" : "cancel")}
                    disabled={!!billingActionPending}
                    variant={sub.cancel_at_period_end ? "primary" : "danger"}
                    onClick={() => runBillingAction(sub.cancel_at_period_end ? "resume" : "cancel")}
                  />
                )}
              </div>
            )}
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
function dateOnlyDisplay(value: string | null | undefined) {
  if (!value) return "Not applicable";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
function upcomingBillingDateDisplay(sub: SubscriptionSummary | null) {
  if (!sub?.has_billing_account) return "Not applicable";
  if (sub.cancel_at_period_end) return "Not applicable (canceling)";
  return dateOnlyDisplay(sub.current_period_end || sub.trial_ends_at);
}
function cardDisplay(sub: SubscriptionSummary | null) {
  if (!sub?.payment_method_on_file) return "No card on file";
  const brand = sub.card_brand ? sub.card_brand[0].toUpperCase() + sub.card_brand.slice(1) : "Card";
  return sub.card_last4 ? `${brand} ending in ${sub.card_last4}` : brand;
}
function BillingActionButton({
  label,
  onClick,
  pending,
  disabled,
  variant = "secondary",
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
  disabled: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles =
    variant === "primary"
      ? "brand-gradient text-white"
      : variant === "danger"
        ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
        : "border border-line bg-white text-ink hover:bg-paper";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${styles}`}
    >
      {pending && <Loader2 size={16} className="animate-spin" />}
      {label}
    </button>
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
