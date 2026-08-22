"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, AuthError, authStyles as styles } from "@/components/auth/AuthShell";

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
    <span>Verified in seconds, every sign-in.</span>
  </>
);

export default function MfaChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find((f) => f.status === "verified");
    if (factorsError || !factor) {
      setLoading(false);
      setError(factorsError?.message ?? "No authenticator found on this account.");
      return;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challengeError || !challenge) {
      setLoading(false);
      setError(challengeError?.message ?? "Could not start verification.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code,
    });

    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }

    router.push(searchParams.get("next") || "/dashboard");
    router.refresh();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <AuthShell
      eyebrow="Two-factor verification"
      railHeading="One more step to protect your workspace."
      railSub="We use time-based codes to keep every firm's data locked to its own team."
      railFoot={RAIL_FOOT}
    >
      <h1 className={styles.cardTitle}>Verify it&apos;s you</h1>
      <p className={styles.lede}>Enter the 6-digit code from your authenticator app.</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="code">Authentication code</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            autoFocus
            required
            className={styles.input}
            style={{ textAlign: "center", fontSize: 18, letterSpacing: "0.3em" }}
          />
        </div>

        {error && <AuthError>{error}</AuthError>}

        <button type="submit" disabled={loading} className={styles.submit}>
          {loading && <span className={styles.spinner} />}
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>

      <button
        type="button"
        onClick={signOut}
        className={styles.link}
        style={{ marginTop: 16, display: "block", textAlign: "center", width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
      >
        Sign in as someone else
      </button>
    </AuthShell>
  );
}
