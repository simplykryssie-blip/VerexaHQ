"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UserPlus } from "lucide-react";
import { DuplicateClientModal } from "@/components/DuplicateClientModal";
import { saveClientDraft, loadClientDraft, clearClientDraft } from "@/lib/clientDraft";

const DRAFT_KEY = "new-engagement-inline";

type InlineDraft = {
  clientType: "individual" | "business";
  firstName: string;
  lastName: string;
  businessName: string;
  email: string;
  phone: string;
};

type ClientOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  client_type: string;
};

function clientLabel(c: ClientOption) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

function ClientSearchField({
  workspaceId,
  selected,
  onSelect,
}: {
  workspaceId: string;
  selected: ClientOption | null;
  onSelect: (client: ClientOption | null) => void;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newClientType, setNewClientType] = useState<"individual" | "business">("individual");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<{ matchedOn: string[]; existingClientId: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Landed here from the global draft banner -- reopen the inline create
    // panel pre-filled instead of requiring a second manual step.
    if (searchParams.get("resumeClientDraft") !== DRAFT_KEY) return;
    const draft = loadClientDraft<InlineDraft>(DRAFT_KEY);
    if (draft) {
      setNewClientType(draft.clientType);
      setNewFirstName(draft.firstName);
      setNewLastName(draft.lastName);
      setNewBusinessName(draft.businessName);
      setNewEmail(draft.email);
      setNewPhone(draft.phone);
    }
    setShowCreate(true);
    router.replace("/engagements/new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .eq("workspace_id", workspaceId)
        .is("merged_into_client_id", null)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,business_name.ilike.%${query}%`)
        .limit(8);
      setResults((data as ClientOption[]) ?? []);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, workspaceId, supabase]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setResults([]);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function createClientInline(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (newClientType === "individual" && (!newFirstName.trim() || !newLastName.trim())) {
      setCreateError("First and last name are required.");
      return;
    }
    if (newClientType === "business" && !newBusinessName.trim()) {
      setCreateError("Business name is required.");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc("create_client", {
      p_workspace_id: workspaceId,
      p_client_type: newClientType,
      p_first_name: newClientType === "individual" ? newFirstName.trim() : undefined,
      p_last_name: newClientType === "individual" ? newLastName.trim() : undefined,
      p_business_name: newClientType === "business" ? newBusinessName.trim() : undefined,
      p_primary_email: newEmail || undefined,
      p_primary_phone: newPhone || undefined,
    });
    setCreating(false);
    if (error) {
      setCreateError(error.message);
      return;
    }
    const result = data as { client_id: string; is_new: boolean; duplicate_matched_on: string[] };
    if (!result.is_new) {
      // Matched an existing client -- don't select it into this engagement
      // silently. Block here until the user confirms it's not a duplicate.
      setDuplicateMatch({ matchedOn: result.duplicate_matched_on ?? [], existingClientId: result.client_id });
      return;
    }
    onSelect({
      id: result.client_id,
      first_name: newClientType === "individual" ? newFirstName.trim() : null,
      last_name: newClientType === "individual" ? newLastName.trim() : null,
      business_name: newClientType === "business" ? newBusinessName.trim() : null,
      client_type: newClientType,
    });
    setShowCreate(false);
    setNewFirstName("");
    setNewLastName("");
    setNewBusinessName("");
    setNewEmail("");
    setNewPhone("");
    clearClientDraft(DRAFT_KEY);
  }

  if (selected) {
    return (
      <div className="mt-1 flex items-center justify-between rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm">
        <span className="font-medium text-ink">{clientLabel(selected)}</span>
        <button type="button" onClick={() => onSelect(null)} className="text-xs font-medium text-accent hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients by name..."
        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-sm">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c);
                  setQuery("");
                  setResults([]);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate hover:bg-surfaceMuted"
              >
                {clientLabel(c)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!showCreate ? (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          <UserPlus size={13} /> No match -- create a new client
        </button>
      ) : (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
          <div className="flex gap-2">
            {(["individual", "business"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setNewClientType(t)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition ${
                  newClientType === t ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:bg-surface"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {newClientType === "individual" ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="First name"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                placeholder="Last name"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          ) : (
            <input
              placeholder="Business name"
              value={newBusinessName}
              onChange={(e) => setNewBusinessName(e.target.value)}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="email"
              placeholder="Email (optional)"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <p className="text-xs text-muted">Address and other details can be filled in later from the client&apos;s profile.</p>
          {createError && <p className="text-xs text-danger">{createError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surface">
              Cancel
            </button>
            <button
              type="button"
              onClick={createClientInline}
              disabled={creating}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create client"}
            </button>
          </div>
        </div>
      )}

      {duplicateMatch && (
        <DuplicateClientModal
          matchedOn={duplicateMatch.matchedOn}
          existingClientId={duplicateMatch.existingClientId}
          onCancel={() => setDuplicateMatch(null)}
          onViewExisting={() => {
            saveClientDraft(DRAFT_KEY, {
              clientType: newClientType,
              firstName: newFirstName,
              lastName: newLastName,
              businessName: newBusinessName,
              email: newEmail,
              phone: newPhone,
            } satisfies InlineDraft);
            router.push(`/clients/${duplicateMatch.existingClientId}`);
          }}
        />
      )}
    </div>
  );
}

export function NewEngagementForm({
  workspaceId,
  hasAnyClients,
  defaultClient,
  services,
  autoAssignToSelf,
}: {
  workspaceId: string;
  hasAnyClients: boolean;
  defaultClient: ClientOption | null;
  services: { id: string; name: string }[];
  /** Independent PTIN workspaces are one person -- there's no one else to
   *  assign, so skip the manual assignment step and just assign the
   *  account holder creating the engagement. */
  autoAssignToSelf?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(defaultClient);
  const [serviceId, setServiceId] = useState("");
  const [priority, setPriority] = useState<"Low" | "Medium" | "High" | "Urgent">("Medium");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedClient) {
      setError("Select or create a client.");
      return;
    }
    if (!serviceId) {
      setError("Select a service.");
      return;
    }

    setLoading(true);

    let assignedStaffId: string | null = null;
    if (autoAssignToSelf) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      assignedStaffId = user?.id ?? null;
    }

    // create_engagement is the single source of truth for deriving
    // workflow_id/current_stage from a service's process -- this form and
    // the bundled engagement step in NewClientButton.tsx both call it, so
    // the derivation can't drift out of sync between the two entry points.
    const { data, error } = await supabase.rpc("create_engagement", {
      p_workspace_id: workspaceId,
      p_client_id: selectedClient.id,
      p_service_id: serviceId,
      p_assigned_staff_id: assignedStaffId ?? undefined,
      p_priority: priority,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/engagements/${data as string}`);
    router.refresh();
  }

  if (!hasAnyClients && !selectedClient) {
    return (
      <p className="text-sm text-muted">
        Search below to create your first client, then start an engagement for them.
      </p>
    );
  }

  if (services.length === 0) {
    return (
      <p className="text-sm text-muted">
        No published services yet -- add one in Settings &gt; Service Packages before creating an engagement.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate">Client</label>
        <ClientSearchField workspaceId={workspaceId} selected={selectedClient} onSelect={setSelectedClient} />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Service</label>
        <select
          required
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="" disabled>
            Select a service
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Determines this engagement&apos;s workflow and starting stage.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Priority</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as "Low" | "Medium" | "High" | "Urgent")}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </select>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate hover:bg-surfaceMuted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create engagement"}
        </button>
      </div>
    </form>
  );
}
