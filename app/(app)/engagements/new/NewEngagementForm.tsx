"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UserPlus } from "lucide-react";
import { DuplicateClientModal } from "@/components/DuplicateClientModal";
import { saveClientDraft, loadClientDraft, clearClientDraft } from "@/lib/clientDraft";
import { renderEmail } from "@/lib/email/template";
import { formatPhone } from "@/lib/phone";
import { CASE_TYPES } from "@/lib/caseTypes";

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
  primary_email?: string | null;
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
        .select("id, first_name, last_name, business_name, client_type, primary_email")
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
      primary_email: newEmail || null,
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
              onBlur={(e) => setNewEmail(e.target.value.trim().toLowerCase())}
              className="rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={newPhone}
              onChange={(e) => setNewPhone(formatPhone(e.target.value))}
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

type PendingOrganizerResponse = { id: string; resolved_service_id: string };

export function NewEngagementForm({
  workspaceId,
  hasAnyClients,
  defaultClient,
  services,
  pipelines,
  billingRules,
  autoAssignToSelf,
}: {
  workspaceId: string;
  hasAnyClients: boolean;
  defaultClient: ClientOption | null;
  services: { id: string; name: string; organizer_template_id: string | null; billing_rule_id: string | null; organizer_templates: { name: string } | null }[];
  pipelines: { id: string; name: string }[];
  billingRules: { id: string; name: string }[];
  /** Independent PTIN workspaces are one person -- there's no one else to
   *  assign, so skip the manual assignment step and just assign the
   *  account holder creating the engagement. */
  autoAssignToSelf?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(defaultClient);
  const [caseType, setCaseType] = useState<string>("other");
  const [dueDate, setDueDate] = useState("");
  // A case doesn't need a workflow at all -- Service and Pipeline are two
  // alternate ways to attach one (a service bundles billing/organizer on
  // top of its pipeline; a bare pipeline is just the stages). "none" is
  // the default so nothing here is a gate to creating the case.
  const [workflowKind, setWorkflowKind] = useState<"none" | "service" | "pipeline">("none");
  const [serviceId, setServiceId] = useState("");
  const [serviceTouched, setServiceTouched] = useState(false);
  const [pipelineId, setPipelineId] = useState("");
  const [billingRuleId, setBillingRuleId] = useState("");
  const [billingRuleTouched, setBillingRuleTouched] = useState(false);
  const [priority, setPriority] = useState<"Low" | "Medium" | "High" | "Urgent">("Medium");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<PendingOrganizerResponse | null>(null);
  const [organizerPrompt, setOrganizerPrompt] = useState<{
    engagementId: string;
    organizerTemplateId: string;
    organizerName: string;
  } | null>(null);
  const [sendingOrganizer, setSendingOrganizer] = useState(false);
  const [organizerError, setOrganizerError] = useState<string | null>(null);

  // The client already completed an organizer that points to a specific
  // service -- that's what should drive the service picker here, not a
  // blind default. Only take over the field while the user hasn't touched
  // it themselves.
  useEffect(() => {
    if (!selectedClient) {
      setPendingResponse(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("organizer_responses")
        .select("id, resolved_service_id")
        .eq("client_id", selectedClient.id)
        .is("engagement_id", null)
        .in("status", ["submitted", "reviewed"])
        .not("resolved_service_id", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data?.resolved_service_id) {
        setPendingResponse({ id: data.id, resolved_service_id: data.resolved_service_id });
        if (!serviceTouched) {
          setWorkflowKind("service");
          setServiceId(data.resolved_service_id);
        }
      } else {
        setPendingResponse(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id]);

  function selectService(id: string) {
    setWorkflowKind("service");
    setServiceTouched(true);
    setServiceId(id);
    setPipelineId("");
    if (!billingRuleTouched) {
      const service = services.find((s) => s.id === id);
      setBillingRuleId(service?.billing_rule_id ?? "");
    }
  }

  function selectPipeline(id: string) {
    setWorkflowKind("pipeline");
    setPipelineId(id);
    setServiceTouched(true);
    setServiceId("");
  }

  function clearWorkflow() {
    setWorkflowKind("none");
    setServiceTouched(true);
    setServiceId("");
    setPipelineId("");
  }

  function handleWorkflowChange(value: string) {
    if (!value) {
      clearWorkflow();
      return;
    }
    const [kind, id] = value.split(":");
    if (kind === "service") selectService(id);
    else if (kind === "pipeline") selectPipeline(id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedClient) {
      setError("Select or create a client.");
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
    // workflow_id/current_stage from a service's (or a bare pipeline's)
    // process -- this form and the bundled engagement step in
    // NewClientButton.tsx both call it, so the derivation can't drift out
    // of sync between the two entry points.
    const { data, error } = await supabase.rpc("create_engagement", {
      p_workspace_id: workspaceId,
      p_client_id: selectedClient.id,
      p_service_id: workflowKind === "service" ? serviceId : undefined,
      p_process_id: workflowKind === "pipeline" ? pipelineId : undefined,
      p_assigned_staff_id: assignedStaffId ?? undefined,
      p_priority: priority,
      p_billing_rule_id: billingRuleId || undefined,
      p_case_type: caseType,
      p_due_date: dueDate || undefined,
    });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    const engagementId = data as string;

    // They already completed the organizer that led to this exact service --
    // link that response to the new engagement instead of asking them to
    // fill out (or the client to resend) the same thing a second time.
    if (pendingResponse && pendingResponse.resolved_service_id === serviceId) {
      const { error: linkError } = await supabase
        .from("organizer_responses")
        .update({ engagement_id: engagementId })
        .eq("id", pendingResponse.id);
      setLoading(false);
      if (linkError) {
        setError(linkError.message);
        return;
      }
      router.push(`/engagements/${engagementId}`);
      router.refresh();
      return;
    }

    setLoading(false);
    const selectedService = services.find((s) => s.id === serviceId);
    if (selectedService?.organizer_template_id) {
      setOrganizerPrompt({
        engagementId,
        organizerTemplateId: selectedService.organizer_template_id,
        organizerName: selectedService.organizer_templates?.name ?? "organizer",
      });
      return;
    }

    router.push(`/engagements/${engagementId}`);
    router.refresh();
  }

  function goToEngagement(engagementId: string) {
    router.push(`/engagements/${engagementId}`);
    router.refresh();
  }

  async function sendOrganizerNow() {
    if (!organizerPrompt || !selectedClient) return;
    setSendingOrganizer(true);
    setOrganizerError(null);

    const { error: responseError } = await supabase.from("organizer_responses").insert({
      workspace_id: workspaceId,
      client_id: selectedClient.id,
      engagement_id: organizerPrompt.engagementId,
      organizer_template_id: organizerPrompt.organizerTemplateId,
    });
    if (responseError) {
      setSendingOrganizer(false);
      setOrganizerError(responseError.message);
      return;
    }

    const { count: existingPortalUsers } = await supabase
      .from("client_portal_users")
      .select("id", { count: "exact", head: true })
      .eq("client_id", selectedClient.id);

    const primaryEmail = selectedClient.primary_email;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

    if (!existingPortalUsers) {
      // No portal access yet -- invite and send the organizer in the same
      // email rather than two separate manual steps. The invite email
      // already looks up the client's open organizer_responses and names
      // them, so creating the response first (above) means this one email
      // covers both.
      const { data: invite, error: inviteError } = await supabase
        .from("client_portal_users")
        .insert({ client_id: selectedClient.id, workspace_id: workspaceId, invited_name: clientLabel(selectedClient), invited_email: primaryEmail ?? "" })
        .select("invitation_token")
        .single();
      if (inviteError) {
        setSendingOrganizer(false);
        setOrganizerError(inviteError.message);
        return;
      }
      if (primaryEmail) {
        const acceptUrl = `${appUrl}/portal/accept-invitation?token=${invite.invitation_token}`;
        const emailRes = await fetch("/api/portal-invitations/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selectedClient.id, invitedEmail: primaryEmail, invitedName: clientLabel(selectedClient), acceptUrl }),
        });
        const emailResult = await emailRes.json().catch(() => null);
        if (!emailRes.ok || !emailResult?.sent) {
          setSendingOrganizer(false);
          setOrganizerError(`Organizer and invite created, but the email couldn't be sent. Share this link with them directly: ${acceptUrl}`);
          return;
        }
      }
    } else if (primaryEmail) {
      // Already has portal access -- just notify them the organizer is ready.
      const emailRes = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: primaryEmail,
          sender: "notifications",
          subject: `New organizer to complete: ${organizerPrompt.organizerName}`,
          html: renderEmail({
            heading: "An organizer is ready for you",
            bodyHtml: `<p>Please log in to your client portal and complete the <strong>${organizerPrompt.organizerName}</strong> when you have a chance.</p>`,
            ctaLabel: "Go to portal",
            ctaUrl: `${appUrl}/portal/organizer`,
          }),
        }),
      });
      const emailResult = await emailRes.json().catch(() => null);
      if (!emailRes.ok || !emailResult?.sent) {
        setSendingOrganizer(false);
        setOrganizerError("Organizer created, but the notification email couldn't be sent. The client won't know it's waiting for them until you tell them directly.");
        return;
      }
    }

    setSendingOrganizer(false);
    goToEngagement(organizerPrompt.engagementId);
  }

  if (!hasAnyClients && !selectedClient) {
    return (
      <p className="text-sm text-muted">
        Search below to create your first client, then start an engagement for them.
      </p>
    );
  }

  const workflowValue = workflowKind === "service" ? `service:${serviceId}` : workflowKind === "pipeline" ? `pipeline:${pipelineId}` : "";

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate">Client</label>
        <ClientSearchField workspaceId={workspaceId} selected={selectedClient} onSelect={setSelectedClient} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate">Case type</label>
          <select
            value={caseType}
            onChange={(e) => setCaseType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {CASE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate">Due date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Workflow</label>
        <select
          value={workflowValue}
          onChange={(e) => handleWorkflowChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">No workflow yet -- set this up later</option>
          {pipelines.length > 0 && (
            <optgroup label="Pipelines">
              {pipelines.map((p) => (
                <option key={p.id} value={`pipeline:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
          {services.length > 0 && (
            <optgroup label="Services">
              {services.map((s) => (
                <option key={s.id} value={`service:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {pendingResponse && pendingResponse.resolved_service_id === serviceId && workflowKind === "service" ? (
          <p className="mt-1 text-xs text-success">
            Suggested from the organizer they already completed -- their answers will be attached to this engagement instead of asking again.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">
            Optional. A Pipeline is just the stages; a Service also bundles billing and an intake organizer. Attach one now or later.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Payment method</label>
        <select
          value={billingRuleId}
          onChange={(e) => {
            setBillingRuleTouched(true);
            setBillingRuleId(e.target.value);
          }}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">None set</option>
          {billingRules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">Defaults from the service, but this client may pay differently -- change it here if so.</p>
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

    {organizerPrompt && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-lg">
          <h3 className="text-sm font-semibold text-ink">Send organizer now?</h3>
          <p className="mt-2 text-sm text-slate">
            Send <strong>{organizerPrompt.organizerName}</strong> to <strong>{selectedClient ? clientLabel(selectedClient) : "the client"}</strong> now?
            {selectedClient && !selectedClient.primary_email && " This client has no email on file, so it will be ready in their portal but no notification will be sent."}
          </p>
          {organizerError && <p className="mt-2 text-xs text-danger">{organizerError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => goToEngagement(organizerPrompt.engagementId)}
              disabled={sendingOrganizer}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
            >
              Later
            </button>
            <button
              type="button"
              onClick={sendOrganizerNow}
              disabled={sendingOrganizer}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {sendingOrganizer ? "Sending..." : "Yes, send"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
