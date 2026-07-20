"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Eye, EyeOff, Plus, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client, ClientTag } from "@/lib/types";
import { clientDisplayName } from "@/lib/clientDisplay";
import { useWorkspace } from "@/components/WorkspaceProvider";

// clients.account_type still accepts individual | household | business |
// estate | trust | nonprofit | other, but the create/edit form only offers
// the two the practice actually uses day to day.
const ACCOUNT_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
];

const ENTITY_TYPES = new Set(["business", "trust", "estate", "nonprofit", "other"]);

const ENTITY_NAME_LABEL: Record<string, string> = {
  business: "Business name",
  trust: "Trust name",
  estate: "Estate name",
  nonprofit: "Organization name",
  other: "Entity name",
};

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatSSN(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length < 4) return digits;
  if (digits.length < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function formatEIN(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length < 3) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function friendlyError(message: string) {
  if (message.toLowerCase().includes("row-level security")) {
    return "Your session may have expired or your access changed. Refresh the page, sign in again, and retry.";
  }
  return message;
}

const SERVICE_OPTIONS = [
  "Bookkeeping",
  "Tax Preparation",
  "Payroll",
  "Financial Statements",
  "Sales Tax",
  "Advisory & Consulting",
  "Audit & Assurance",
];

// clients.client_type only allows individual | business | family — this app's
// other pages branch on client_type === "business" to decide whether to show
// business_name, so every entity-style account_type maps to "business" here
// and "household" maps to the legacy "family" value.
function deriveClientType(accountType: string): "individual" | "business" | "family" {
  if (accountType === "individual") return "individual";
  if (accountType === "household") return "family";
  return "business";
}

type ContactSearchResult = { id: string; first_name: string; last_name: string; personal_email: string | null };
type MaskedIdentity = { vault_id: string; identity_type: string; masked_value: string; last_four: string | null };

export default function ClientModal({
  client,
  onClose,
  onSaved,
  onDeleted,
}: {
  client?: Client;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const { activeWorkspaceId } = useWorkspace();
  const isEditing = !!client;
  const workspaceId = client?.workspace_id ?? activeWorkspaceId;

  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    account_type: client?.account_type ?? "individual",
    account_name: client?.account_name ?? "",
    business_name: client?.business_name ?? "",
    address: client?.address ?? "",
    city: client?.city ?? "",
    state: client?.state ?? "",
    zip_code: client?.zip_code ?? "",
    status: client?.status ?? "lead",
    source: client?.source ?? "",
    first_name: client?.first_name ?? "",
    middle_name: "",
    last_name: client?.last_name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    occupation: "",
    portal_access: false,
  });
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactMode, setContactMode] = useState<"create" | "link">("create");
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<ContactSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [availableTags, setAvailableTags] = useState<ClientTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [availableMembers, setAvailableMembers] = useState<{ user_id: string; label: string }[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const isEntity = ENTITY_TYPES.has(form.account_type);
  const identityType = isEntity ? "ein" : "ssn";
  const identityLabel = isEntity ? "EIN" : "SSN";

  const [maskedIdentity, setMaskedIdentity] = useState<MaskedIdentity | null>(null);
  const [identityStage, setIdentityStage] = useState<"masked" | "input" | "reveal">("input");
  const [newIdentityValue, setNewIdentityValue] = useState("");
  const [identityPassword, setIdentityPassword] = useState("");
  const [identityReason, setIdentityReason] = useState("");
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    supabase
      .from("client_tags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("tag_name")
      .then(({ data }) => setAvailableTags((data as ClientTag[]) ?? []));
    supabase
      .from("workspace_members")
      .select("user_id, display_name, role")
      .eq("workspace_id", workspaceId)
      .then(({ data }) =>
        setAvailableMembers(
          ((data as any[]) ?? []).map((m) => ({
            user_id: m.user_id,
            label: m.display_name || m.role || "Team member",
          }))
        )
      );
  }, [workspaceId]);

  useEffect(() => {
    if (!isEditing || !client) return;
    supabase
      .from("client_tag_assignments")
      .select("tag_id")
      .eq("client_id", client.id)
      .then(({ data }) => setSelectedTagIds(((data as any[]) ?? []).map((r) => r.tag_id)));
    supabase
      .from("client_team_members")
      .select("user_id")
      .eq("client_id", client.id)
      .then(({ data }) => setSelectedMemberIds(((data as any[]) ?? []).map((r) => r.user_id)));
    supabase
      .from("account_contacts")
      .select("contact_id, contacts(middle_name, occupation, portal_access)")
      .eq("account_id", client.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const c = (data as any).contacts;
        setContactId((data as any).contact_id);
        if (c) {
          setForm((f) => ({
            ...f,
            middle_name: c.middle_name ?? "",
            occupation: c.occupation ?? "",
            portal_access: c.portal_access ?? false,
          }));
        }
      });
    supabase
      .rpc("get_client_identity_vault_masked", { p_workspace_id: client.workspace_id, p_client_id: client.id })
      .then(({ data }) => {
        const list = (data as MaskedIdentity[]) ?? [];
        const match = list.find((v) => v.identity_type === identityType) ?? list[0];
        if (match) {
          setMaskedIdentity(match);
          setIdentityStage("masked");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, client?.id]);

  async function searchContacts() {
    if (!workspaceId || contactQuery.trim().length < 2) return;
    setSearching(true);
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, personal_email")
      .eq("workspace_id", workspaceId)
      .or(`first_name.ilike.%${contactQuery}%,last_name.ilike.%${contactQuery}%`)
      .limit(8);
    setContactResults((data as ContactSearchResult[]) ?? []);
    setSearching(false);
  }

  function selectExistingContact(c: ContactSearchResult) {
    setContactId(c.id);
    setForm((f) => ({ ...f, first_name: c.first_name, last_name: c.last_name, email: c.personal_email ?? "" }));
    setContactResults([]);
    setContactQuery("");
  }

  function toggleTagId(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function addTag() {
    const name = tagInput.trim();
    if (!name || !workspaceId) return;
    const existing = availableTags.find((t) => t.tag_name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) toggleTagId(existing.id);
      setTagInput("");
      return;
    }
    const { data, error } = await supabase
      .from("client_tags")
      .insert({ workspace_id: workspaceId, tag_name: name })
      .select("*")
      .single();
    if (!error && data) {
      setAvailableTags((prev) => [...prev, data as ClientTag]);
      setSelectedTagIds((prev) => [...prev, (data as ClientTag).id]);
    }
    setTagInput("");
  }

  function toggleMember(id: string) {
    setSelectedMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  }

  function toggleService(service: string) {
    setSelectedServices((prev) =>
      prev.includes(service) ? prev.filter((s) => s !== service) : [...prev, service]
    );
  }

  function goToContacts(e: React.FormEvent) {
    e.preventDefault();
    setStep(2);
  }

  async function startReveal() {
    setIdentityError(null);
    setIdentityStage("reveal");
  }

  async function confirmReveal() {
    if (!client || !maskedIdentity) return;
    setIdentityBusy(true);
    setIdentityError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user.email;
    if (!email) {
      setIdentityBusy(false);
      setIdentityError("Not signed in.");
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: identityPassword });
    setIdentityPassword("");
    if (authError) {
      setIdentityBusy(false);
      setIdentityError("Incorrect password.");
      return;
    }
    if (identityReason.trim().length < 5) {
      setIdentityBusy(false);
      setIdentityError("Enter a reason for viewing this (at least 5 characters).");
      return;
    }
    const { data, error: revealError } = await supabase.rpc("get_identity_vault_value", {
      p_workspace_id: client.workspace_id,
      p_vault_id: maskedIdentity.vault_id,
      p_reason: identityReason,
    });
    setIdentityBusy(false);
    if (revealError) {
      setIdentityError(revealError.message);
      return;
    }
    setRevealedValue((data as any).value);
    setIdentityReason("");
    setTimeout(() => {
      setRevealedValue(null);
      setIdentityStage("masked");
    }, 30000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      setError("Could not determine your workspace. Close this and try again.");
      return;
    }
    setSaving(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setSaving(false);
      setError("Your session has expired. Refresh the page and sign in again.");
      return;
    }
    const userId = sessionData.session.user.id;

    const contactFullName = `${form.first_name} ${form.last_name}`.trim();
    const resolvedAccountName = form.account_name.trim() || (isEntity ? form.business_name : contactFullName);

    const clientPayload = {
      client_type: deriveClientType(form.account_type),
      account_type: form.account_type,
      account_name: resolvedAccountName,
      first_name: form.first_name,
      last_name: form.last_name,
      business_name: form.business_name,
      email: form.email,
      phone: form.phone,
      status: form.status,
      source: form.source,
      address: form.address,
      city: form.city,
      state: form.state,
      zip_code: form.zip_code,
    };

    let clientId = client?.id ?? "";

    if (isEditing) {
      const { error: updateError } = await supabase.from("clients").update(clientPayload).eq("id", client!.id);
      if (updateError) {
        setSaving(false);
        setError(friendlyError(updateError.message));
        return;
      }
    } else {
      const { data: newClient, error: insertError } = await supabase
        .from("clients")
        .insert({ workspace_id: workspaceId, ...clientPayload, assigned_to: userId })
        .select("id")
        .single();
      if (insertError) {
        setSaving(false);
        setError(friendlyError(insertError.message));
        return;
      }
      clientId = newClient!.id;
    }

    if (form.first_name || form.last_name) {
      if (contactId) {
        await supabase
          .from("contacts")
          .update({
            first_name: form.first_name,
            middle_name: form.middle_name || null,
            last_name: form.last_name,
            personal_email: form.email || null,
            personal_phone: form.phone || null,
            occupation: form.occupation || null,
            portal_access: form.portal_access,
          })
          .eq("id", contactId);
        const { data: existingLink } = await supabase
          .from("account_contacts")
          .select("id")
          .eq("account_id", clientId)
          .eq("contact_id", contactId)
          .maybeSingle();
        if (!existingLink) {
          await supabase.from("account_contacts").insert({
            workspace_id: workspaceId,
            account_id: clientId,
            contact_id: contactId,
            relationship_type: "primary",
            is_primary: true,
            portal_access: form.portal_access,
          });
        }
      } else {
        const { data: newContact, error: contactError } = await supabase
          .from("contacts")
          .insert({
            workspace_id: workspaceId,
            first_name: form.first_name,
            middle_name: form.middle_name || null,
            last_name: form.last_name,
            personal_email: form.email || null,
            personal_phone: form.phone || null,
            occupation: form.occupation || null,
            portal_access: form.portal_access,
          })
          .select("id")
          .single();
        if (!contactError && newContact) {
          await supabase.from("account_contacts").insert({
            workspace_id: workspaceId,
            account_id: clientId,
            contact_id: newContact.id,
            relationship_type: "primary",
            is_primary: true,
            portal_access: form.portal_access,
          });
        }
      }
    }

    await supabase.from("client_tag_assignments").delete().eq("client_id", clientId);
    if (selectedTagIds.length > 0) {
      await supabase
        .from("client_tag_assignments")
        .insert(selectedTagIds.map((tag_id) => ({ workspace_id: workspaceId, client_id: clientId, tag_id })));
    }

    await supabase.from("client_team_members").delete().eq("client_id", clientId);
    if (selectedMemberIds.length > 0) {
      await supabase
        .from("client_team_members")
        .insert(selectedMemberIds.map((user_id) => ({ workspace_id: workspaceId, client_id: clientId, user_id })));
    }

    if (newIdentityValue.trim()) {
      const { error: idError } = await supabase.rpc("save_identity_vault_value", {
        p_workspace_id: workspaceId,
        p_client_id: clientId,
        p_related_contact_id: null,
        p_identity_type: identityType,
        p_plain_value: newIdentityValue,
        p_reason: "Saved via client form",
      });
      if (!idError && identityType === "ssn") {
        const digits = newIdentityValue.replace(/\D/g, "");
        await supabase.from("clients").update({ ssn_last_four: digits.slice(-4) }).eq("id", clientId);
      }
    }

    if (!isEditing && selectedServices.length > 0) {
      const currentYear = new Date().getFullYear().toString();
      await supabase.from("services").insert(
        selectedServices.map((service_type) => ({
          workspace_id: workspaceId,
          client_id: clientId,
          service_type,
          service_status: "New",
          service_year: currentYear,
        }))
      );
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!client) return;
    const name = clientDisplayName(client);
    if (
      !window.confirm(
        `Delete ${name}? This removes the client record but not their services, tasks, or deadlines — remove those first if you want a clean delete.`
      )
    )
      return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from("clients").delete().eq("id", client.id);
    setDeleting(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-8">
      <div className="bg-white rounded-2xl border border-line shadow-lg w-full max-w-2xl max-h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-slab text-lg font-bold text-ink">
            {isEditing ? "Edit Client" : "New Client"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink rounded-xl p-1.5 hover:bg-paper transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-3 border-b border-line pb-4 mb-5">
          <StepBadge active={step === 1} done={step > 1}>1</StepBadge>
          <span className={`text-sm font-semibold ${step === 1 ? "text-ink" : "text-muted"}`}>Account info</span>
          <ChevronRight size={14} className="text-line" />
          <StepBadge active={step === 2} done={false}>2</StepBadge>
          <span className={`text-sm font-semibold ${step === 2 ? "text-ink" : "text-muted"}`}>Contact</span>
        </div>

        {step === 1 && (
          <form onSubmit={goToContacts} className="space-y-5">
            <Section label="Client type">
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                {ACCOUNT_TYPES.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="account_type"
                      checked={form.account_type === t.value}
                      onChange={() => setForm({ ...form, account_type: t.value })}
                      className="h-4 w-4 accent-[#108A64]"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </Section>

            <Section label="Account info">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs text-muted">Account name</span>
                  <input
                    placeholder="Shown on the Clients page — leave blank to auto-fill from the contact/entity name"
                    value={form.account_name}
                    onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                    className="client-input w-full"
                  />
                </label>
                {isEntity && (
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-xs text-muted">
                      {ENTITY_NAME_LABEL[form.account_type]} <span className="text-brick">*</span>
                    </span>
                    <input
                      required
                      value={form.business_name}
                      onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                      className="client-input w-full"
                    />
                  </label>
                )}
              </div>
            </Section>

            <Section label="Address">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  placeholder="Street address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="client-input w-full sm:col-span-2"
                />
                <input
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="client-input w-full"
                />
                <div className="flex gap-3">
                  <input
                    placeholder="State"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="client-input w-1/2"
                  />
                  <input
                    placeholder="ZIP code"
                    value={form.zip_code}
                    onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
                    className="client-input w-1/2"
                  />
                </div>
              </div>
            </Section>

            <Section label="Tags">
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedTagIds.map((id) => {
                  const tag = availableTags.find((t) => t.id === id);
                  if (!tag) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-[#108A64] text-xs font-semibold px-2.5 py-1"
                    >
                      {tag.tag_name}
                      <button type="button" onClick={() => toggleTagId(id)} aria-label={`Remove ${tag.tag_name}`}>
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input
                  list="tag-suggestions"
                  placeholder="Add a tag…"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="client-input flex-1"
                />
                <datalist id="tag-suggestions">
                  {availableTags.map((t) => (
                    <option key={t.id} value={t.tag_name} />
                  ))}
                </datalist>
                <button
                  type="button"
                  onClick={addTag}
                  className="rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-paper"
                >
                  Add
                </button>
              </div>
            </Section>

            <Section label="Team members">
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedMemberIds.map((id) => {
                  const member = availableMembers.find((m) => m.user_id === id);
                  if (!member) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-paper-dim bg-paper border border-line text-xs font-semibold text-ink px-2.5 py-1"
                    >
                      {member.label}
                      <button type="button" onClick={() => toggleMember(id)} aria-label={`Remove ${member.label}`}>
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) toggleMember(e.target.value);
                }}
                className="client-input w-full"
              >
                <option value="">Add a team member…</option>
                {availableMembers
                  .filter((m) => !selectedMemberIds.includes(m.user_id))
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.label}
                    </option>
                  ))}
              </select>
            </Section>

            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-sm font-semibold py-2.5 px-3.5 rounded-xl border border-brick text-brick disabled:opacity-60 hover:bg-brick/5"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold py-2.5 px-4 rounded-xl border border-line text-ink hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isEntity && !form.business_name}
                className="text-sm font-semibold py-2.5 px-5 rounded-xl bg-[#108A64] text-white hover:bg-[#0d7555] disabled:opacity-60"
              >
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {!contactId && (
              <div className="flex gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setContactMode("create")}
                  className={`rounded-xl px-3 py-1.5 ${contactMode === "create" ? "bg-[#108A64] text-white" : "border border-line text-muted"}`}
                >
                  Create new contact
                </button>
                <button
                  type="button"
                  onClick={() => setContactMode("link")}
                  className={`rounded-xl px-3 py-1.5 ${contactMode === "link" ? "bg-[#108A64] text-white" : "border border-line text-muted"}`}
                >
                  Link existing contact
                </button>
              </div>
            )}

            {contactMode === "link" && !contactId && (
              <Section label="Find a contact">
                <div className="flex gap-2">
                  <input
                    placeholder="Search by name…"
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    className="client-input flex-1"
                  />
                  <button
                    type="button"
                    onClick={searchContacts}
                    className="flex items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-paper"
                  >
                    <Search size={14} /> {searching ? "…" : "Search"}
                  </button>
                </div>
                {contactResults.length > 0 && (
                  <div className="mt-2 divide-y divide-line rounded-xl border border-line">
                    {contactResults.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => selectExistingContact(c)}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-paper"
                      >
                        <div className="font-semibold text-ink">
                          {c.first_name} {c.last_name}
                        </div>
                        {c.personal_email && <div className="text-xs text-muted">{c.personal_email}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {contactId && (
              <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-3 py-2.5 text-sm">
                <span>
                  Linked to <strong className="text-ink">{form.first_name} {form.last_name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setContactId(null);
                    setContactMode("create");
                  }}
                  className="text-xs font-semibold text-muted hover:text-ink"
                >
                  Change
                </button>
              </div>
            )}

            <Section label="Name">
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  disabled={!!contactId}
                  placeholder="First name"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="client-input w-full disabled:opacity-60"
                />
                <input
                  disabled={!!contactId}
                  placeholder="Middle name"
                  value={form.middle_name}
                  onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
                  className="client-input w-full disabled:opacity-60"
                />
                <input
                  required
                  disabled={!!contactId}
                  placeholder="Last name"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="client-input w-full disabled:opacity-60"
                />
              </div>
            </Section>

            <Section label="Contact">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="client-input w-full"
                />
                <input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                  className="client-input w-full"
                />
                <input
                  placeholder="Occupation"
                  value={form.occupation}
                  onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                  className="client-input w-full"
                />
                <input
                  placeholder="Referral source (e.g. Referral, Website, Google)"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="client-input w-full"
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.portal_access}
                  onChange={(e) => setForm({ ...form, portal_access: e.target.checked })}
                  className="h-4 w-4 accent-[#108A64]"
                />
                Give this contact portal access
              </label>
            </Section>

            <Section label={identityLabel}>
              {isEditing && identityStage === "masked" && maskedIdentity && (
                <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
                  <span className="font-mono text-ink">{maskedIdentity.masked_value}</span>
                  <div className="flex gap-3">
                    <button type="button" onClick={startReveal} className="text-xs font-semibold text-[#108A64] flex items-center gap-1">
                      <Eye size={13} /> Reveal
                    </button>
                    <button
                      type="button"
                      onClick={() => setIdentityStage("input")}
                      className="text-xs font-semibold text-muted"
                    >
                      Replace
                    </button>
                  </div>
                </div>
              )}

              {identityStage === "reveal" && (
                <div className="space-y-2 rounded-xl border border-line p-3">
                  {revealedValue ? (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-ink">{revealedValue}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setRevealedValue(null);
                          setIdentityStage("masked");
                        }}
                        className="text-xs font-semibold text-muted flex items-center gap-1"
                      >
                        <EyeOff size={13} /> Hide
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted">Confirm your password and reason to view the full {identityLabel}.</p>
                      <input
                        type="password"
                        placeholder="Your account password"
                        value={identityPassword}
                        onChange={(e) => setIdentityPassword(e.target.value)}
                        className="client-input w-full"
                      />
                      <input
                        placeholder="Reason (e.g. Confirming for tax filing)"
                        value={identityReason}
                        onChange={(e) => setIdentityReason(e.target.value)}
                        className="client-input w-full"
                      />
                      {identityError && <p className="text-xs text-brick">{identityError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setIdentityStage("masked")}
                          className="text-xs font-semibold py-2 px-3 rounded-xl border border-line text-ink"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmReveal}
                          disabled={identityBusy}
                          className="text-xs font-semibold py-2 px-3 rounded-xl bg-[#108A64] text-white disabled:opacity-60"
                        >
                          {identityBusy ? "Verifying…" : "Confirm"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {identityStage === "input" && (
                <input
                  placeholder={isEntity ? "12-3456789" : "123-45-6789"}
                  value={newIdentityValue}
                  onChange={(e) =>
                    setNewIdentityValue(isEntity ? formatEIN(e.target.value) : formatSSN(e.target.value))
                  }
                  className="client-input w-full"
                />
              )}
            </Section>

            {isEditing && (
              <Section label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="client-input w-full"
                >
                  <option value="lead">Lead</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </Section>
            )}

            {!isEditing && (
              <Section label="Services (optional)">
                <div className="grid gap-2 sm:grid-cols-2">
                  {SERVICE_OPTIONS.map((service) => (
                    <label
                      key={service}
                      className="flex items-center gap-2 text-sm text-ink border border-line rounded-xl px-3 py-2.5 cursor-pointer hover:bg-paper"
                    >
                      <input
                        type="checkbox"
                        checked={selectedServices.includes(service)}
                        onChange={() => toggleService(service)}
                        className="w-4 h-4 accent-[#108A64]"
                      />
                      {service}
                    </label>
                  ))}
                </div>
              </Section>
            )}

            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-sm font-semibold py-2.5 px-4 rounded-xl border border-line text-ink hover:bg-paper"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl border border-line text-ink hover:bg-paper"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl bg-[#108A64] text-white hover:bg-[#0d7555] disabled:opacity-60"
              >
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>
      <style jsx global>{`
        .client-input {
          border: 1px solid #ddeae5;
          border-radius: 0.75rem;
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          background: #fff;
          outline: none;
        }
        .client-input:focus {
          border-color: #108a64;
          box-shadow: 0 0 0 3px rgba(16, 138, 100, 0.12);
        }
        .client-input:disabled {
          background: #f5faf8;
        }
      `}</style>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{label}</div>
      {children}
    </div>
  );
}

function StepBadge({ active, done, children }: { active: boolean; done: boolean; children: React.ReactNode }) {
  return (
    <span
      className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold"
      style={{
        backgroundColor: done ? "#108A64" : active ? "#108A64" : "#EEEAE0",
        color: done || active ? "white" : "#6E7268",
      }}
    >
      {done ? <Check size={13} /> : children}
    </span>
  );
}
