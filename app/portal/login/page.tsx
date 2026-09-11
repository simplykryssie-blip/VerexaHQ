"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/authErrors";
import { AuthShell, AuthError, authStyles as styles } from "@/components/auth/AuthShell";
import { PasswordInput } from "@/components/PasswordInput";

export const dynamic = "force-dynamic";

const RAIL_FOOT = (
  <>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1L12 3v4c0 3.5-2.2 5.7-5 6.5C4.2 12.7 2 10.5 2 7V3l5-2Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
    <span>Encrypted &amp; audit-logged, firm-side</span>
  </>
);

export default function PortalLoginPage() {
  const router = useRouter();
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

    const { data: lockout } = await supabase.rpc("check_login_lockout", { p_email: email });
    if ((lockout as { locked?: boolean } | null)?.locked) {
      setLoading(false);
      setError("This account is temporarily locked due to too many failed sign-in attempts. Try again later.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    await supabase.rpc("record_login_result", { p_email: email, p_success: !error });
    if (error) {
      setLoading(false);
      setError(friendlyAuthError(error.message));
      return;
    }

    await fetch("/api/auth/set-remember", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remember: rememberMe }),
    });

    setLoading(false);
    router.push("/portal/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      eyebrow="Client portal"
      railHeading="Your documents, your return — one place."
      railSub="Every file and message here is encrypted and visible only to your tax team."
      railFoot={RAIL_FOOT}
    >
      <h1 className={styles.cardTitle}>Client Portal</h1>
      <p className={styles.lede}>Sign in to view your documents, messages, and billing.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={styles.input}
            autoComplete="email"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <PasswordInput
            id="password"
            required
            minLength={6}
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
        Firm staff should sign in at{" "}
        <Link href="/login" className={styles.link}>
          the staff login
        </Link>{" "}
        instead.
      </p>
    </AuthShell>
  );
}
