"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { checkRateLimitClientSide } from "@/lib/authRateLimitClient";
import { friendlyAuthError } from "@/lib/authErrors";
import { validatePasswordStrength, passwordRequirementsHint } from "@/lib/passwordStrength";
import { AuthShell, AuthError, authStyles as styles } from "@/components/auth/AuthShell";

export const dynamic = "force-dynamic";

const RAIL_FOOT = (
  <>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 4v3.2l2 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
    <span>Streamline. Automate. Grow.</span>
  </>
);

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const supabase = createClient();
  const [mode, setMode] = useState<"sign-in" | "sign-up">(searchParams.get("mode") === "signup" ? "sign-up" : "sign-in");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [firmName, setFirmName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const allowed = await checkRateLimitClientSide("login", email);
      if (allowed === false) {
        setError("Too many sign-in attempts. Please wait a few minutes and try again.");
        return;
      }

      const { data: lockout } = await supabase.rpc("check_login_lockout", { p_email: email });
      if ((lockout as { locked?: boolean } | null)?.locked) {
        setError("This account is temporarily locked due to too many failed sign-in attempts. Try again later.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      await supabase.rpc("record_login_result", { p_email: email, p_success: !error });

      if (error) {
        setError(friendlyAuthError(error.message));
        return;
      }

      await fetch("/api/auth/set-remember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remember: rememberMe }),
      });

      router.push(next ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }

    setLoading(true);
    try {
      const allowed = await checkRateLimitClientSide("signup", email);
      if (allowed === false) {
        setError("Too many signup attempts. Please wait a while and try again.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: { first_name: firstName, last_name: lastName, firm_name: firmName },
        },
      });

      if (error) {
        setError(friendlyAuthError(error.message));
        return;
      }

      // Supabase signals "this email already has an account" by returning an
      // empty identities array instead of an error -- no confirmation email
      // gets sent in that case, which otherwise looks exactly like broken
      // email delivery.
      if (data.user && data.user.identities?.length === 0) {
        setError("An account with this email already exists. Sign in instead.");
        setMode("sign-in");
        return;
      }

      setCheckEmail(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: "sign-in" | "sign-up") {
    setError(null);
    setMode(next);
  }

  if (checkEmail) {
    return (
      <AuthShell
        eyebrow="Firm workspace"
        railHeading="Almost there."
        railSub="Confirm your email to finish setting up your firm's workspace."
        railFoot={RAIL_FOOT}
      >
        <h1 className={styles.cardTitle}>Check your email</h1>
        <p className={styles.lede}>
          We sent a confirmation link to <strong>{email}</strong>. Click it to finish creating your workspace.
        </p>
        <Link href="/login" className={styles.submit} style={{ textDecoration: "none" }}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  if (mode === "sign-up") {
    return (
      <AuthShell
        eyebrow="Firm workspace"
        railHeading="Run your practice, not paperwork."
        railSub="Engagements, documents, billing, and e-signatures -- one workspace for the whole firm."
        railFoot={RAIL_FOOT}
      >
        <h1 className={styles.cardTitle}>Create your workspace</h1>
        <p className={styles.lede}>Start your free trial -- no credit card required.</p>

        <form onSubmit={handleSignUp} className={styles.form}>
          <div style={{ display: "flex", gap: 12 }}>
            <div className={styles.field} style={{ flex: 1 }}>
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={styles.input}
                autoComplete="given-name"
              />
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={styles.input}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="firmName">Firm name</label>
            <input
              id="firmName"
              required
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="Your Firm, LLC"
              className={styles.input}
              autoComplete="organization"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signupEmail">Email</label>
            <input
              id="signupEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourfirm.com"
              className={styles.input}
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="signupPassword">Password</label>
            <input
              id="signupPassword"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              className={styles.input}
              autoComplete="new-password"
            />
            <p className={styles.hint}>{passwordRequirementsHint()}</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className={styles.input}
              autoComplete="new-password"
            />
          </div>

          {error && <AuthError>{error}</AuthError>}

          <button type="submit" disabled={loading} className={styles.submit}>
            {loading && <span className={styles.spinner} />}
            {loading ? "Creating account…" : "Start my free trial"}
          </button>
        </form>

        <p className={styles.crosslink}>
          Already have a workspace?{" "}
          <button type="button" onClick={() => switchMode("sign-in")} className={styles.link} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}>
            Sign in
          </button>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Firm workspace"
      railHeading="Run your practice, not paperwork."
      railSub="Engagements, documents, billing, and e-signatures -- one workspace for the whole firm."
      railFoot={RAIL_FOOT}
    >
      <h1 className={styles.cardTitle}>Sign in to your workspace</h1>
      <p className={styles.lede}>Use the email and password for your firm account.</p>

      <form onSubmit={handleSignIn} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourfirm.com"
            className={styles.input}
            autoComplete="email"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className={styles.input}
            autoComplete="current-password"
          />
        </div>

        <div className={styles.row}>
          <label className={styles.remember}>
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Remember me
          </label>
          <Link href="/forgot-password" className={styles.link}>
            Forgot password?
          </Link>
        </div>

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading && <span className={styles.spinner} />}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className={styles.crosslink}>
        New to Verexa HQ?{" "}
        <button type="button" onClick={() => switchMode("sign-up")} className={styles.link} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit" }}>
          Start your free trial
        </button>
      </p>
    </AuthShell>
  );
}
