"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Blocks the entire app shell -- rendered by (app)/layout.tsx in place of
// {children} whenever a workspace owner hasn't accepted the current terms
// version, so there is no page to navigate around it and no way to close
// this without accepting (no dismiss button, no click-outside). A full
// reload after accepting re-runs the layout's server-side check for real,
// rather than trusting client state to flip a boolean.
export function AcceptTermsGate({ version }: { version: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!checked || saving) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("accept_platform_terms", { p_version: version });
    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-soft">
        <h1 className="text-xl font-semibold text-ink">Before you continue</h1>
        <p className="mt-2 text-sm text-slate">
          We&apos;ve updated our Terms of Service and Privacy Policy. Please review and accept them to keep using Verexa.
        </p>

        <div className="mt-5 flex flex-col gap-2 text-sm">
          <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            Read the Terms of Service &rarr;
          </Link>
          <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
            Read the Privacy Policy &rarr;
          </Link>
        </div>

        <label className="mt-6 flex items-start gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
          />
          I have read and accept the Terms of Service and Privacy Policy.
        </label>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <button
          type="button"
          onClick={accept}
          disabled={!checked || saving}
          className="mt-6 w-full rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Accept and continue"}
        </button>
      </div>
    </div>
  );
}
