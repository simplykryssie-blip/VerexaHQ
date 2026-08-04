"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const dynamic = 'force-dynamic';

const WORKSPACE_TYPES = [
  { value: "independent_ptin", label: "Independent PTIN" },
  { value: "ero_office", label: "ERO Office" },
  { value: "service_bureau", label: "Service Bureau" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [workspaceType, setWorkspaceType] = useState(WORKSPACE_TYPES[0].value);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.rpc("create_workspace", {
      p_name: name,
      p_workspace_type: workspaceType,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Set up your firm</h1>
        <p className="mt-1 text-sm text-muted">
          Create your Verexa workspace to get started.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate" htmlFor="name">
              Firm name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Tax Advisors"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate" htmlFor="workspace_type">
              How do you operate?
            </label>
            <select
              id="workspace_type"
              value={workspaceType}
              onChange={(e) => setWorkspaceType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {WORKSPACE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
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
            {loading ? "Creating..." : "Create workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
