"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { checkRateLimitClientSide } from "@/lib/authRateLimitClient";
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

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const allowed = await checkRateLimitClientSide("password-reset", email);
      if (allowed === false) {
        setError("Too many requests. Please wait a few minutes and try again.");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        eyebrow="Account recovery"
        railHeading="Almost there."
        railSub="Check your inbox for a link to choose a new password."
        railFoot={RAIL_FOOT}
      >
        <h1 className={styles.cardTitle}>Check your email</h1>
        <p className={styles.lede}>
          If an account exists for <strong>{email}</strong>, a password reset link has been sent.
        </p>
        <Link href="/login" className={styles.submit} style={{ textDecoration: "none" }}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      railHeading="Get back into your account."
      railSub="We'll email you a secure link to choose a new password."
      railFoot={RAIL_FOOT}
    >
      <h1 className={styles.cardTitle}>Reset your password</h1>
      <p className={styles.lede}>We&apos;ll email you a link to choose a new password.</p>

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

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading && <span className={styles.spinner} />}
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className={styles.crosslink}>
        <Link href="/login" className={styles.link}>
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
