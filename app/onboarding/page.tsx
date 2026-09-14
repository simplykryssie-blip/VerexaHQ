"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

// Self-serve workspace creation, reopened at the user's explicit request --
// see the reopen_self_serve_signup migration for why this is safe now.
// A signed-in user with no workspace membership lands here, either fresh
// off /login's sign-up form (in which case their firm name from signup
// metadata prefills the form below) or because an invite they expected
// never arrived and they'd rather just start their own.
export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(false);
  const [firmName, setFirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (portalUser) {
        router.replace("/portal/dashboard");
        return;
      }

      const meta = user.user_metadata as { firm_name?: string } | undefined;
      if (meta?.firm_name) setFirmName(meta.firm_name);
      setChecked(true);
    });
  }, [supabase, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firmName.trim()) {
      setError("Enter your firm's name.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.rpc("create_workspace", { p_name: firmName.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (!checked) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Set up your firm</h1>
        <p className="mt-2 text-sm text-muted">
          Create your workspace to get started. If you were expecting an invitation to join an existing firm instead,
          check your email for it, or reach out to whoever set up your account.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="firmName" className="mb-1 block text-sm font-medium text-ink">
              Firm name
            </label>
            <input
              id="firmName"
              required
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="Your Firm, LLC"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
          >
            {loading ? "Creating workspace…" : "Create my workspace"}
          </button>
        </form>

        <button type="button" onClick={signOut} className="mt-4 w-full text-center text-sm text-muted hover:underline">
          Sign out
        </button>
      </div>
    </div>
  );
}
