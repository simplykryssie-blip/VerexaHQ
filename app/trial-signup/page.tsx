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
    <span>No card required. Cancel anytime.</span>
  </>
);

// Public self-serve trial signup -- creates a real account + a real
// independent-PTIN workspace with a 14-day trial, no admin step. Structured
// after app/join/page.tsx (same signed-out/needs-workspace/has-workspace
// states, same email-confirmation survival trick), minus the invite-token
// preview/redeem branches since there's no invite here -- just
// create_trial_workspace instead of accept_firm_connection_invite. See that
// RPC's migration for why self-serve was reopened only for this one path.
export default function TrialSignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [authState, setAuthState] = useState<"loading" | "signed-out" | "needs-workspace" | "has-workspace">("loading");

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [firstName, setFirstName] = useState(searchParams.get("first_name") ?? "");
  const [lastName, setLastName] = useState(searchParams.get("last_name") ?? "");
  const [companyName, setCompanyName] = useState(searchParams.get("company_name") ?? "");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [ready, setReady] = useState(false);

  const [manualFirmName, setManualFirmName] = useState("");

  async function provisionTrial(name: string) {
    setProvisioning(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = user?.user_metadata as { first_name?: string; last_name?: string } | undefined;
    const { error: rpcError } = await supabase.rpc("create_trial_workspace", {
      p_name: name,
      p_first_name: meta?.first_name ?? undefined,
      p_last_name: meta?.last_name ?? undefined,
    });
    if (rpcError) {
      setProvisioning(false);
      setError(rpcError.message);
      setAuthState("needs-workspace");
      return;
    }
    setReady(true);
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
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
      // Brand new user, just confirmed their email -- auto-create their
      // trial workspace from the name they gave at signup, no separate step.
      const meta = user.user_metadata as { company_name?: string } | undefined;
      if (meta?.company_name) {
        await provisionTrial(meta.company_name);
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
    await provisionTrial(manualFirmName.trim());
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
      // pending_trial_next mirrors app/join's pending_invite_next -- see
      // app/auth/confirm/route.ts's resolveNext(): Supabase's own
      // /auth/v1/verify redirect can silently strip query params off
      // emailRedirectTo, so this metadata (written straight to auth.users,
      // not threaded through the redirect URL) is the fallback that
      // survives when that happens.
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/trial-signup`,
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
            pending_trial_next: "/trial-signup",
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

  if (authState === "loading") {
    return (
      <AuthShell eyebrow="14-day trial" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <p className={styles.lede}>Loading...</p>
      </AuthShell>
    );
  }

  if (ready) {
    return (
      <AuthShell eyebrow="14-day trial" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>You&apos;re in</h1>
        <p className={styles.lede}>Your trial workspace is ready. Taking you to your dashboard...</p>
      </AuthShell>
    );
  }

  if (checkEmail) {
    return (
      <AuthShell eyebrow="14-day trial" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Check your email</h1>
        <p className={styles.lede}>
          Account created. Confirm your email -- a link has been sent to <strong>{email}</strong> -- and your 14-day trial workspace will
          be ready as soon as you click it.
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
      <AuthShell eyebrow="14-day trial" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
        <h1 className={styles.cardTitle}>Almost there</h1>
        <p className={styles.lede}>Just your firm name to spin up your 14-day trial workspace.</p>
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
          {error && <AuthError>{error}</AuthError>}
          <button type="submit" disabled={provisioning} className={styles.submit}>
            {provisioning ? "Setting up..." : "Start my trial"}
          </button>
        </form>
      </AuthShell>
    );
  }

  // signed-out: combined sign-up/sign-in.
  return (
    <AuthShell eyebrow="14-day trial" railHeading="Run your practice, not paperwork." railSub="One signup, one workspace." railFoot={RAIL_FOOT}>
      <h1 className={styles.cardTitle}>Start your 14-day trial</h1>
      <p className={styles.lede}>
        {mode === "sign-up" ? "Create your Verexa account -- your trial workspace is ready the moment you confirm your email." : "Sign in to your existing account."}
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
          {loading ? (mode === "sign-in" ? "Signing in..." : "Starting your trial...") : mode === "sign-in" ? "Sign in" : "Start my trial"}
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
        {mode === "sign-in" ? "New here? Start your trial" : "Already have an account? Sign in"}
      </button>
    </AuthShell>
  );
}
