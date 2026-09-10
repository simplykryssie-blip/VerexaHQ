"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
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
    <span>Streamline. Automate. Grow.</span>
  </>
);

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkState, setLinkState] = useState<"checking" | "ready" | "invalid">("checking");

  // The recovery link is supposed to hand off a session automatically --
  // usually via a URL fragment (#access_token=...) the Supabase browser
  // client auto-detects on load, sometimes via a ?code= or ?token_hash=
  // query param instead. Previously this page just assumed that had already
  // happened and called updateUser() directly; when auto-detection silently
  // failed (link already used, expired, opened after an email scanner
  // pre-fetched and consumed it, or a race with the SDK's own async
  // detection), the user got a bare "Auth session missing!" only after
  // typing a new password -- a dead end with no way forward. Checking
  // explicitly up front, with an exchange fallback and a real error state,
  // turns that into an actionable "request a new link" message instead.
  useEffect(() => {
    let cancelled = false;
    let resolved = false;

    function markReady() {
      if (!cancelled && !resolved) {
        resolved = true;
        setLinkState("ready");
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        markReady();
      }
    });

    async function establishSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        markReady();
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          markReady();
          return;
        }
      } else {
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type") as EmailOtpType | null;
        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
          if (!error) {
            markReady();
            return;
          }
        }
      }

      // Give the SDK's own async fragment detection (and the
      // onAuthStateChange listener above) a brief window before giving up.
      setTimeout(() => {
        if (!cancelled && !resolved) setLinkState("invalid");
      }, 1500);
    }

    establishSession();
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
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
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (linkState === "checking") {
    return (
      <AuthShell eyebrow="Account recovery" railHeading="Choose a new password." railSub="Verifying your link..." railFoot={RAIL_FOOT}>
        <p className={styles.lede}>Verifying your link...</p>
      </AuthShell>
    );
  }

  if (linkState === "invalid") {
    return (
      <AuthShell
        eyebrow="Account recovery"
        railHeading="Choose a new password."
        railSub="Pick something secure -- you'll be signed in right away once it's set."
        railFoot={RAIL_FOOT}
      >
        <h1 className={styles.cardTitle}>This link isn&apos;t valid anymore</h1>
        <p className={styles.lede}>
          Password reset links work once and expire after a short time. Request a new one to continue -- if you opened this
          on a different device or browser than the one you requested it from, request it again from this device instead.
        </p>
        <Link href="/forgot-password" className={styles.submit} style={{ textDecoration: "none", display: "inline-block", textAlign: "center" }}>
          Request a new link
        </Link>
      </AuthShell>
    );
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
          <PasswordInput
            id="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
            className={styles.input}
            autoComplete="new-password"
          />
          <p className={styles.hint}>{PASSWORD_REQUIREMENTS_HINT}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor="confirm_password">Confirm new password</label>
          <PasswordInput
            id="confirm_password"
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
