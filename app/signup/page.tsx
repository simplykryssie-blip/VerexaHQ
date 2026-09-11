"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/authErrors";
import { AuthShell, AuthError, authStyles as styles } from "@/components/auth/AuthShell";
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from "@/lib/passwordStrength";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

const RAIL_FOOT = (
  <>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4v3.2l2 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
    <span>Secure checkout via Stripe. Cancel anytime.</span>
  </>
);

const DEFAULT_PLAN = "solo";

type PlanRow = {
  slug: string;
  name: string;
  base_price_cents: number;
  included_seats: number;
};

function money(cents: number) {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toLocaleString()}` : `$${dollars.toFixed(2)}`;
}

function PlanPicker({ plans, value, onChange }: { plans: PlanRow[]; value: string; onChange: (slug: string) => void }) {
  return (
    <div className={styles.field}>
      <label>Plan</label>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${plans.length}, 1fr)`, gap: 8 }}>
        {plans.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => onChange(p.slug)}
            style={{
              textAlign: "left",
              borderRadius: 10,
              padding: "10px 12px",
              border: value === p.slug ? "1.5px solid var(--accent, #0b7fe0)" : "1px solid var(--border, #e3e7f0)",
              background: value === p.slug ? "rgba(11,127,224,.06)" : "transparent",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <span style={{ display: "block", fontWeight: 700, fontSize: 13 }}>{p.name}</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--muted, #64748b)" }}>{money(p.base_price_cents)}/mo</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Public self-serve signup -- creates a real account + a real workspace,
// then requires a paid Stripe subscription before it's usable (no free
// trial: see 20260925010000_remove_trial_require_paid_signup for why).
// Structured after app/join/page.tsx (same signed-out/needs-workspace/
// has-workspace states, same email-confirmation survival trick), minus the
// invite-token preview/redeem branches since there's no invite here --
// create_paid_workspace instead of accept_firm_connection_invite, and a
// Stripe Checkout redirect instead of landing straight in the dashboard.
export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [authState, setAuthState] = useState<"loading" | "signed-out" | "needs-workspace" | "has-workspace">("loading");

  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [firstName, setFirstName] = useState(searchParams.get("first_name") ?? "");
  const [lastName, setLastName] = useState(searchParams.get("last_name") ?? "");
  const [companyName, setCompanyName] = useState(searchParams.get("company_name") ?? "");
  const [planSlug, setPlanSlug] = useState(searchParams.get("plan") ?? DEFAULT_PLAN);
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const [manualFirmName, setManualFirmName] = useState("");
  const [manualPlanSlug, setManualPlanSlug] = useState(DEFAULT_PLAN);

  useEffect(() => {
    supabase.rpc("get_public_platform_plans").then(({ data }) => setPlans((data as PlanRow[] | null) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function provisionThenCheckout(name: string, plan: string) {
    setProvisioning(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = user?.user_metadata as { first_name?: string; last_name?: string } | undefined;
    const { error: rpcError } = await supabase.rpc("create_paid_workspace", {
      p_name: name,
      p_plan_slug: plan,
      p_first_name: meta?.first_name ?? undefined,
      p_last_name: meta?.last_name ?? undefined,
    });
    if (rpcError) {
      setProvisioning(false);
      setError(rpcError.message);
      setAuthState("needs-workspace");
      return;
    }

    setRedirecting(true);
    const res = await fetch("/api/signup/checkout", { method: "POST" });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setProvisioning(false);
      setRedirecting(false);
      setError(data.error ?? "Could not start checkout.");
      setAuthState("needs-workspace");
      return;
    }
    // Hard navigation to Stripe -- nothing left to do client-side once the
    // checkout URL exists.
    window.location.href = data.url;
  }

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthState("signed-out");
        return;
      }
      const { data: membership } = await supabase
        .from("workspace_users")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (membership) {
        router.replace("/dashboard");
        return;
      }
      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (portalUser) {
        router.replace("/portal/dashboard");
        return;
      }
      // Brand new user, just confirmed their email -- go straight to
      // checkout for the plan they picked at signup, no separate step.
      const meta = user.user_metadata as { company_name?: string; plan_slug?: string } | undefined;
      if (meta?.company_name) {
        await provisionThenCheckout(meta.company_name, meta.plan_slug ?? DEFAULT_PLAN);
      } else {
        setAuthState("needs-workspace");
      }
    }
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitManualFirmName(e: React.FormEvent) {
    e.preventDefault();
    if (!manualFirmName.trim()) return;
    await provisionThenCheckout(manualFirmName.trim(), manualPlanSlug);
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "sign-up") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      const strengthError = validatePasswordStrength(password);
      if (strengthError) {
        setError(strengthError);
        return;
      }
      if (!companyName.trim()) {
        setError("Firm name is required.");
        return;
      }

      setLoading(true);
      // pending_signup_next mirrors app/join's pending_invite_next -- see
      // app/auth/confirm/route.ts's resolveNext(): Supabase's own
      // /auth/v1/verify redirect can silently strip query params off
      // emailRedirectTo, so this metadata (written straight to auth.users,
      // not threaded through the redirect URL) is the fallback that
      // survives when that happens.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/signup`,
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
            plan_slug: planSlug,
            pending_signup_next: "/signup",
          },
        },
      });
      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.user && data.user.identities?.length === 0) {
        setError('An account with this email already exists. Try signing in, or use "Forgot password?" if you need to reset it.');
        return;
      }
      setCheckEmail(true);
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(friendlyAuthError(signInError.message));
      return;
    }
    router.refresh();
    window.location.reload();
  }

  if (authState === "loading" || plans === null) {
    return (
      <AuthShell eyebrow="Get started" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <p className={styles.lede}>Loading...</p>
      </AuthShell>
    );
  }

  if (provisioning || redirecting) {
    return (
      <AuthShell eyebrow="Get started" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Taking you to checkout...</h1>
        <p className={styles.lede}>Add your card to activate your workspace.</p>
      </AuthShell>
    );
  }

  if (checkEmail) {
    return (
      <AuthShell eyebrow="Get started" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Check your email</h1>
        <p className={styles.lede}>
          Account created. Confirm your email -- a link has been sent to <strong>{email}</strong> -- and you&apos;ll be taken straight to
          checkout to activate your workspace.
        </p>
        <button
          type="button"
          onClick={() => {
            setCheckEmail(false);
            setError(null);
            setMode("sign-in");
          }}
          className={styles.link}
          style={{ marginTop: 16, display: "block", textAlign: "center", width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
        >
          Already confirmed? Sign in
        </button>
      </AuthShell>
    );
  }

  if (authState === "needs-workspace") {
    return (
      <AuthShell eyebrow="Get started" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Almost there</h1>
        <p className={styles.lede}>Just your firm name and plan to set up your workspace and continue to checkout.</p>
        <form onSubmit={submitManualFirmName} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="manual_firm_name">Firm name</label>
            <input
              id="manual_firm_name"
              required
              value={manualFirmName}
              onChange={(e) => setManualFirmName(e.target.value)}
              placeholder="Acme Tax Advisors"
              className={styles.input}
            />
          </div>
          <PlanPicker plans={plans} value={manualPlanSlug} onChange={setManualPlanSlug} />
          {error && <AuthError>{error}</AuthError>}
          <button type="submit" disabled={provisioning} className={styles.submit}>
            {provisioning ? "Setting up..." : "Continue to checkout"}
          </button>
        </form>
      </AuthShell>
    );
  }

  // signed-out: combined sign-up/sign-in.
  return (
    <AuthShell eyebrow="Get started" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
      <h1 className={styles.cardTitle}>Create your Verexa account</h1>
      <p className={styles.lede}>
        {mode === "sign-up" ? "Pick a plan and set up your workspace -- you'll continue to checkout to activate it." : "Sign in to your existing account."}
      </p>

      <form onSubmit={handleAuthSubmit} className={styles.form}>
        {mode === "sign-up" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className={styles.field}>
                <label htmlFor="first_name">First name</label>
                <input id="first_name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={styles.input} autoComplete="given-name" />
              </div>
              <div className={styles.field}>
                <label htmlFor="last_name">Last name</label>
                <input id="last_name" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={styles.input} autoComplete="family-name" />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="company_name">Firm name</label>
              <input
                id="company_name"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Tax Advisors"
                className={styles.input}
                autoComplete="organization"
              />
            </div>
            <PlanPicker plans={plans} value={planSlug} onChange={setPlanSlug} />
          </>
        )}

        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={styles.input} autoComplete="email" />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            required
            minLength={mode === "sign-up" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          />
          {mode === "sign-up" && <p className={styles.hint}>{PASSWORD_REQUIREMENTS_HINT}</p>}
        </div>
        {mode === "sign-up" && (
          <div className={styles.field}>
            <label htmlFor="confirm_password">Confirm password</label>
            <PasswordInput
              id="confirm_password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
          </div>
        )}

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading ? (mode === "sign-in" ? "Signing in..." : "Creating account...") : mode === "sign-in" ? "Sign in" : "Continue"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setError(null);
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
        }}
        className={styles.link}
        style={{ marginTop: 16, display: "block", textAlign: "center", width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
      >
        {mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </AuthShell>
  );
}
