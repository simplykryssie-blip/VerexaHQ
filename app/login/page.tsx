"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { checkRateLimitClientSide } from "@/lib/authRateLimitClient";
import { friendlyAuthError } from "@/lib/authErrors";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <AuthShell
      eyebrow="Firm workspace"
      railHeading="Run your practice, not paperwork."
      railSub="Engagements, documents, billing, and e-signatures -- one workspace for the whole firm."
      railFoot={RAIL_FOOT}
    >
      <h1 className={styles.cardTitle}>Sign in to your workspace</h1>
      <p className={styles.lede}>Use the email and password for your firm account.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
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
    </AuthShell>
  );
}
