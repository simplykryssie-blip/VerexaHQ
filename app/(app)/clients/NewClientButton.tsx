"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type EngagementTypeOption = { id: string; name: string };

export function NewClientButton({
  workspaceId,
  engagementTypes,
}: {
  workspaceId: string;
  engagementTypes: EngagementTypeOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [clientType, setClientType] = useState<"individual" | "business">("individual");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [engagementTypeId, setEngagementTypeId] = useState("");
  const [ssn, setSsn] = useState("");
  const [itin, setItin] = useState("");
  const [ein, setEin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isBusiness = clientType === "business";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isBusiness && (!email || !phone)) {
      setError("Business email and phone are required to create a lead.");
      return;
    }
    if (isBusiness && (!contactFirstName || !contactLastName)) {
      setError("Contact person's first and last name are required.");
      return;
    }
    if (isBusiness && !engagementTypeId) {
      setError("Select the service they're applying for.");
      return;
    }

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
      p_ssn: clientType === "individual" ? ssn || undefined : undefined,
      p_ein: clientType === "business" ? ein || undefined : undefined,
      p_itin: clientType === "individual" ? itin || undefined : undefined,
    });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const result = data as { client_id: string };

    if (isBusiness) {
      const { error: contactError } = await supabase.from("client_contacts").insert({
        client_id: result.client_id,
        workspace_id: workspaceId,
        first_name: contactFirstName,
        last_name: contactLastName,
        email: email || null,
        phone: phone || null,
        is_primary: true,
      });
      if (contactError) {
        setLoading(false);
        setError(contactError.message);
        return;
      }

      const { error: engagementError } = await supabase.from("engagements").insert({
        workspace_id: workspaceId,
        client_id: result.client_id,
        engagement_type_id: engagementTypeId,
      });
      if (engagementError) {
        setLoading(false);
        setError(engagementError.message);
        return;
      }
    }

    setLoading(false);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 px-4 py-8">
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

              {clientType === "individual" ? (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="SSN (optional)"
                    value={ssn}
                    onChange={(e) => setSsn(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <input
                    placeholder="ITIN (optional)"
                    value={itin}
                    onChange={(e) => setItin(e.target.value)}
                    className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ) : (
                <input
                  placeholder="EIN (optional)"
                  value={ein}
                  onChange={(e) => setEin(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
              <p className="text-xs text-muted">Stored encrypted. Only staff with reveal permission can view the full number later.</p>

              <input
                type="email"
                required={isBusiness}
                placeholder={isBusiness ? "Business email" : "Email (optional)"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                type="tel"
                required={isBusiness}
                placeholder={isBusiness ? "Business phone" : "Phone (optional)"}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />

              {isBusiness && (
                <>
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Contact person
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <input
                        required
                        placeholder="First name"
                        value={contactFirstName}
                        onChange={(e) => setContactFirstName(e.target.value)}
                        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <input
                        required
                        placeholder="Last name"
                        value={contactLastName}
                        onChange={(e) => setContactLastName(e.target.value)}
                        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted">
                      Service applying for
                    </label>
                    <select
                      required
                      value={engagementTypeId}
                      onChange={(e) => setEngagementTypeId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="" disabled>
                        Select a service
                      </option>
                      {engagementTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {engagementTypes.length === 0 && (
                      <p className="mt-1 text-xs text-muted">
                        No services are set up yet -- add engagement types in Settings first.
                      </p>
                    )}
                  </div>
                </>
              )}

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
