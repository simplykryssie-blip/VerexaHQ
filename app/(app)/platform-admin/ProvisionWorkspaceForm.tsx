"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

const WORKSPACE_TYPES = [
  { value: "independent_ptin", label: "Independent PTIN" },
  { value: "ero_office", label: "ERO Office" },
  { value: "service_bureau", label: "Service Bureau" },
];

// Self-serve signup is closed -- this is now the only way a new
// workspace gets created. Submits to a server route (needs the
// service-role key to create the login and send the invite email,
// which the browser can never hold) rather than calling Supabase
// directly the way the rest of this page's client components do.
export function ProvisionWorkspaceForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceType, setWorkspaceType] = useState(WORKSPACE_TYPES[0].value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch("/api/platform-admin/provision-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), firstName: firstName.trim(), lastName: lastName.trim(), workspaceName: workspaceName.trim(), workspaceType }),
    });
    const result = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(result?.error ?? "Could not provision this workspace.");
      return;
    }
    setEmail("");
    setFirstName("");
    setLastName("");
    setWorkspaceName("");
    setWorkspaceType(WORKSPACE_TYPES[0].value);
    toast.show(`Invited ${email.trim()} and created their workspace`, "success");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-soft p-4">
      <h3 className="font-display text-sm font-semibold text-ink">Invite a new firm</h3>
      <p className="mt-1 text-xs text-muted">
        Self-serve signup is closed. Provisioning here creates their login and workspace immediately, and emails them a link to set
        their password.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
            className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
            className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@address.com"
          className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            type="text"
            required
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Firm name"
            className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <select
            value={workspaceType}
            onChange={(e) => setWorkspaceType(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {WORKSPACE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Inviting..." : "Invite & create workspace"}
        </button>
      </form>
    </div>
  );
}
