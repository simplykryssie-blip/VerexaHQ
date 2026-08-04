"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function NewClientButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [clientType, setClientType] = useState<"individual" | "business">("individual");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.rpc("create_client", {
      p_workspace_id: workspaceId,
      p_client_type: clientType,
      p_first_name: clientType === "individual" ? firstName : undefined,
      p_last_name: clientType === "individual" ? lastName : undefined,
      p_business_name: clientType === "business" ? businessName : undefined,
      p_date_of_birth: undefined,
      p_primary_email: email || undefined,
      p_primary_phone: phone || undefined,
      p_ssn: undefined,
      p_ein: undefined,
      p_itin: undefined,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    const result = data as { client_id: string };
    setOpen(false);
    router.push(`/clients/${result.client_id}`);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
      >
        <Plus size={16} /> New Client
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
            <h2 className="text-base font-semibold text-ink">New client</h2>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="flex gap-2">
                {(["individual", "business"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setClientType(t)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                      clientType === t
                        ? "border-accent bg-accentSoft text-accent"
                        : "border-border text-slate hover:bg-surfaceMuted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {clientType === "individual" ? (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    required
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ) : (
                <input
                  required
                  placeholder="Business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}

              <input
                type="email"
                placeholder="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate hover:bg-surfaceMuted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {loading ? "Creating..." : "Create client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
