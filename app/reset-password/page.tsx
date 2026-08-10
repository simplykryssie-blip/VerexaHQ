"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      railHeading="Choose a new password."
      railSub="Pick something secure -- you'll be signed in right away once it's set."
      railFoot={RAIL_FOOT}
    >
      <h1 className={styles.cardTitle}>Choose a new password</h1>
      <p className={styles.lede}>You&apos;ll be signed in automatically once it&apos;s set.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
            className={styles.input}
            autoComplete="new-password"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="confirm_password">Confirm new password</label>
          <input
            id="confirm_password"
            type="password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            className={styles.input}
            autoComplete="new-password"
          />
        </div>

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading && <span className={styles.spinner} />}
          {loading ? "Saving…" : "Set new password"}
        </button>
      </form>
    </AuthShell>
  );
}
