"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { checkRateLimitClientSide } from "@/lib/authRateLimitClient";
import { friendlyAuthError } from "@/lib/authErrors";
import { AuthShell, AuthError, authStyles as styles } from "@/components/auth/AuthShell";
import { validatePasswordStrength, PASSWORD_REQUIREMENTS_HINT } from "@/lib/passwordStrength";

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
  const supabase = createClient();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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

      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          data: {
            first_name: firstName,
            last_name: lastName,
            company_name: companyName,
          },
        },
      });
      setLoading(false);

      if (error) {
        setError(error.message);
        return;
      }

      // Supabase returns a 200 with an empty identities array (rather than
      // an error) when the email is already registered -- a deliberate
      // anti-enumeration measure so signup responses can't be used to probe
      // which emails exist. That's the one case we need to check for
      // ourselves instead of trusting `error`.
      if (data.user && data.user.identities?.length === 0) {
        setError("An account with this email already exists. Try signing in, or use \"Forgot password?\" if you need to reset it.");
        return;
      }

      setCheckEmail(true);
      return;
    }

    setLoading(true);

    try {
      const allowed = await checkRateLimitClientSide("login", email);
      if (allowed === false) {
        setError("Too many sign-in attempts. Please wait a few minutes and try again.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(friendlyAuthError(error.message));
        return;
      }

      await fetch("/api/auth/set-remember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remember: rememberMe }),
      });

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checkEmail) {
    return (
      <AuthShell
        eyebrow="Firm workspace"
        railHeading="Run your practice, not paperwork."
        railSub="Engagements, documents, billing, and e-signatures -- one workspace for the whole firm."
        railFoot={RAIL_FOOT}
      >
        <h1 className={styles.cardTitle}>Check your email</h1>
        <p className={styles.lede}>
          Account created successfully. Please verify your email -- a confirmation link has been sent to{" "}
          <strong>{email}</strong>.
        </p>
        <button
          type="button"
          onClick={() => {
            setCheckEmail(false);
            setMode("sign-in");
          }}
          className={styles.submit}
        >
          Back to sign in
        </button>
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
      <h1 className={styles.cardTitle}>{mode === "sign-in" ? "Sign in to your workspace" : "Create your account"}</h1>
      <p className={styles.lede}>
        {mode === "sign-in" ? "Use the email and password for your firm account." : "Set up your firm's workspace."}
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        {mode === "sign-up" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className={styles.field}>
                <label htmlFor="first_name">First name</label>
                <input
                  id="first_name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={styles.input}
                  autoComplete="given-name"
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="last_name">Last name</label>
                <input
                  id="last_name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={styles.input}
                  autoComplete="family-name"
                />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="company_name">Company / Firm name</label>
              <input
                id="company_name"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Financial Group"
                className={styles.input}
                autoComplete="organization"
              />
            </div>
          </>
        )}

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
            minLength={mode === "sign-up" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "sign-in" ? "Enter your password" : "Create a password"}
            className={styles.input}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          />
          {mode === "sign-up" && <p className={styles.hint}>{PASSWORD_REQUIREMENTS_HINT}</p>}
        </div>

        {mode === "sign-up" && (
          <div className={styles.field}>
            <label htmlFor="confirm_password">Confirm password</label>
            <input
              id="confirm_password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
            />
          </div>
        )}

        {mode === "sign-in" && (
          <div className={styles.row}>
            <label className={styles.remember}>
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              Remember me
            </label>
            <Link href="/forgot-password" className={styles.link}>
              Forgot password?
            </Link>
          </div>
        )}

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading && <span className={styles.spinner} />}
          {loading ? (mode === "sign-in" ? "Signing in…" : "Creating account…") : mode === "sign-in" ? "Sign in" : "Create account"}
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
        {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </AuthShell>
  );
}
