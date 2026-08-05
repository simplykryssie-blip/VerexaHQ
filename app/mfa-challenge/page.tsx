"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

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
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Verify it&apos;s you</h1>
        <p className="mt-1 text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate" htmlFor="code">
              Authentication code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              autoFocus
              required
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-center text-lg tracking-widest focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </form>

        <button type="button" onClick={signOut} className="mt-4 w-full text-center text-sm text-accent hover:underline">
          Sign in as someone else
        </button>
      </div>
    </div>
  );
}
