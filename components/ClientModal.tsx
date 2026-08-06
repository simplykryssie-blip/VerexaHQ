"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import { clientDisplayName } from "@/lib/clientDisplay";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { maskZip } from "@/lib/organizerFormat";
import ConfirmDialog from "@/components/ConfirmDialog";
import { listActiveStaff, type StaffOption } from "@/lib/workspaceMembers";

// create_client only accepts client_type = individual | business (the live
// clients_client_type_check also allows trust/estate/organization, but
// those aren't offered here -- same two-option scope as before).
const CLIENT_TYPES = [
  { value: "individual", label: "Individual" },
  { value: "business", label: "Business" },
];

const LIFECYCLE_STATUSES = [
  ["lead", "Lead"],
  ["consult_scheduled", "Consult scheduled"],
  ["proposal_sent", "Proposal sent"],
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["archived", "Archived"],
] as const;

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// formatPhone rebuilds the entire display string from scratch on every
// keystroke. For a controlled input, React then sets that whole string back
// as .value — which resets the cursor to the end unless something restores
// it. Appending digits at the end is invisibly fine (that's where the
// cursor already was), but editing a digit in the *middle* of an existing
// number silently breaks: the first keystroke lands where you clicked, the
// reformat snaps the cursor to the end, and every keystroke after that
// lands in the wrong place. Fix: figure out how many digits sit before the
// cursor in the raw input, reformat, then place the cursor back after that
// same digit in the reformatted string.
function digitIndexToFormattedCursor(formatted: string, digitsBeforeCursor: number): number {
  if (digitsBeforeCursor <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === digitsBeforeCursor) return i + 1;
    }
  }
  return formatted.length;
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

// next build always bakes NODE_ENV=production into a Vercel deployment —
// preview and production builds are identical on that axis, so NODE_ENV
// can't tell them apart. Only treat this as "real production" when we can
// positively confirm it: either Vercel's own NEXT_PUBLIC_VERCEL_ENV says
// so, or the browser is actually on the production hostname.
const PRODUCTION_HOSTNAME = "verexa-hq-phi.vercel.app";
function computeIsPreviewOrDev(): boolean {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") return false;
  if (typeof window !== "undefined" && window.location.hostname === PRODUCTION_HOSTNAME) return false;
  return true;
}
const IS_PREVIEW_OR_DEV = computeIsPreviewOrDev();

type SbError = { message: string; code?: string; details?: string | null; hint?: string | null };

function stepError(step: string, err: SbError): string {
  if (IS_PREVIEW_OR_DEV) {
    const parts = [`[${step}] ${err.message}`];
    if (err.code) parts.push(`code=${err.code}`);
    if (err.details) parts.push(`details=${err.details}`);
    if (err.hint) parts.push(`hint=${err.hint}`);
    return parts.join(" — ");
  }
  const lower = err.message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("not allowed") || lower.includes("permission")) {
    return "You don't have permission to complete this action. Contact a workspace admin if this seems wrong.";
  }
  if (err.code === "P0001") return err.message;
  return "There was a problem saving. Please try again, and contact support if it keeps happening.";
}

const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const;

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

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    client_type: client?.client_type === "business" ? "business" : "individual",
    business_name: client?.business_name ?? "",
    first_name: client?.first_name ?? "",
    last_name: client?.last_name ?? "",
    // clients has one primary_email/primary_phone — for a business that's
    // the business's own contact info, for an individual it's theirs.
    email: client?.primary_email ?? "",
    phone: client?.primary_phone ?? "",
    address_line1: client?.address_line1 ?? "",
    address_line2: client?.address_line2 ?? "",
    city: client?.city ?? "",
    state: client?.state ?? "",
    postal_code: client?.postal_code ?? "",
    lifecycle_status: client?.lifecycle_status || "lead",
    relationship_manager_id: client?.relationship_manager_id ?? "",
    default_reviewer_id: client?.default_reviewer_id ?? "",
    default_compliance_officer_id: client?.default_compliance_officer_id ?? "",
  });

  const [staff, setStaff] = useState<StaffOption[]>([]);
  useEffect(() => {
    if (!workspaceId) return;
    listActiveStaff(workspaceId).then(setStaff);
  }, [workspaceId]);

  const isEntity = form.client_type === "business";
  const identityLabel = isEntity ? "EIN" : "SSN";
  const existingLast4 = isEntity ? client?.ein_last4 : client?.ssn_last4;

  const [identityStage, setIdentityStage] = useState<"masked" | "input" | "reveal">(
    isEditing && existingLast4 ? "masked" : "input",
  );
  const [newIdentityValue, setNewIdentityValue] = useState("");
  const [identityPassword, setIdentityPassword] = useState("");
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [identityBusy, setIdentityBusy] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  async function startReveal() {
    setIdentityError(null);
    setIdentityStage("reveal");
  }

  async function confirmReveal() {
    if (!client) return;
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
    const { data, error: revealError } = await supabase.rpc(
      isEntity ? "reveal_client_ein" : "reveal_client_ssn",
      { p_client_id: client.id },
    );
    setIdentityBusy(false);
    if (revealError) {
      setIdentityError(stepError("reveal", revealError));
      return;
    }
    setRevealedValue((data as string) ?? "");
    setTimeout(() => {
      setRevealedValue(null);
      setIdentityStage("masked");
    }, 30000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEditing && identityStage === "input" && !newIdentityValue.trim()) {
      setError(`Enter the client's ${identityLabel}.`);
      return;
    }

    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setSaving(false);
      setError("Your session has expired. Refresh the page and sign in again.");
      return;
    }
    if (!workspaceId) {
      setSaving(false);
      setError("Could not determine your workspace. Close this and try again.");
      return;
    }

    const primaryEmail = form.email || null;
    const primaryPhone = form.phone || null;
    let clientId: string;

    if (!isEditing) {
      // create_client validates permission, dedups on ssn/ein/email/phone
      // hashes, and stores ssn/ein/itin encrypted server-side — this sends
      // the plaintext value it expects, never anything pre-masked/encrypted
      // client-side. It has no address/lifecycle_status params; those are
      // set in the follow-up update below.
      const { data: createResult, error: createError } = await supabase.rpc("create_client", {
        p_workspace_id: workspaceId,
        p_client_type: form.client_type,
        p_first_name: isEntity ? null : form.first_name,
        p_last_name: isEntity ? null : form.last_name,
        p_business_name: isEntity ? form.business_name : null,
        p_primary_email: primaryEmail,
        p_primary_phone: primaryPhone,
        p_ssn: !isEntity ? newIdentityValue || null : null,
        p_ein: isEntity ? newIdentityValue || null : null,
      });
      if (createError) {
        setSaving(false);
        setError(stepError("create_client", createError));
        return;
      }
      const result = createResult as { client_id: string; is_new: boolean; duplicate_matched_on: string[] } | null;
      if (!result?.client_id) {
        setSaving(false);
        setError("The client save did not return a client ID.");
        return;
      }
      if (!result.is_new) {
        setSaving(false);
        setError(
          `A client already exists in this workspace matching this ${result.duplicate_matched_on.join("/") || "record"} — no duplicate was created. Find and edit the existing client instead.`,
        );
        return;
      }
      clientId = result.client_id;
    } else {
      clientId = client.id;
    }

    // Address + (on edit) identity/lifecycle fields — none of these are
    // create_client params, and there is no live "update_client" RPC, so
    // this is a direct table write. clients_update RLS requires
    // clients.edit, the same permission a user who can reach this form is
    // expected to already have.
    const updatePayload: Record<string, unknown> = {
      address_line1: form.address_line1 || null,
      address_line2: form.address_line2 || null,
      city: form.city || null,
      state: form.state || null,
      postal_code: form.postal_code || null,
      relationship_manager_id: form.relationship_manager_id || null,
      default_reviewer_id: form.default_reviewer_id || null,
      default_compliance_officer_id: form.default_compliance_officer_id || null,
    };
    if (isEditing) {
      updatePayload.first_name = isEntity ? null : form.first_name;
      updatePayload.last_name = isEntity ? null : form.last_name;
      updatePayload.business_name = isEntity ? form.business_name : null;
      updatePayload.primary_email = primaryEmail;
      updatePayload.primary_phone = primaryPhone;
      updatePayload.lifecycle_status = form.lifecycle_status;
    }
    const { error: updateError } = await supabase.from("clients").update(updatePayload).eq("id", clientId);
    if (updateError) {
      setSaving(false);
      setError(`Client saved, but some details failed to save: ${stepError("clients_update", updateError)}`);
      return;
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!client) return;
    setDeleting(true);
    const { error: deleteError } = await supabase.from("clients").delete().eq("id", client.id);
    setDeleting(false);
    setConfirmingDelete(false);
    if (deleteError) {
      setError(stepError("clients_delete", deleteError));
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 lg:items-center lg:p-4">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden border border-line bg-white shadow-lg lg:h-auto lg:max-h-[90vh] lg:w-full lg:max-w-2xl lg:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
          <h3 className="font-slab text-lg font-bold text-ink">{isEditing ? "Edit Client" : "New Client"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted hover:text-ink rounded-xl p-1.5 hover:bg-paper transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <form id="client-form" onSubmit={handleSubmit} className="space-y-5">
            <Section label="Client type">
              <div className="flex flex-wrap gap-x-5 gap-y-2.5">
                {CLIENT_TYPES.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="client_type"
                      checked={form.client_type === t.value}
                      onChange={() => setForm({ ...form, client_type: t.value })}
                      className="h-4 w-4 accent-[#108A64]"
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </Section>

            {isEntity ? (
              <Section label="Business name (required)">
                <input
                  required
                  placeholder="Greenleaf Consulting LLC"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className="client-input w-full"
                />
              </Section>
            ) : (
              <Section label="Client's name">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    required
                    placeholder="First name"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="client-input w-full"
                  />
                  <input
                    required
                    placeholder="Last name"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="client-input w-full"
                  />
                </div>
              </Section>
            )}

            <Section label={isEntity ? "Business contact info" : "Contact info"}>
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
                  onChange={(e) => {
                    const input = e.target;
                    const rawCursor = input.selectionStart ?? input.value.length;
                    const digitsBeforeCursor = input.value.slice(0, rawCursor).replace(/\D/g, "").length;
                    const formatted = formatPhone(input.value);
                    const newCursor = digitIndexToFormattedCursor(formatted, digitsBeforeCursor);
                    setForm((f) => ({ ...f, phone: formatted }));
                    requestAnimationFrame(() => {
                      input.setSelectionRange(newCursor, newCursor);
                    });
                  }}
                  className="client-input w-full"
                />
              </div>
            </Section>

            <Section label="Address">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  placeholder="Street address"
                  value={form.address_line1}
                  onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
                  className="client-input w-full sm:col-span-2"
                />
                <input
                  placeholder="Apt / suite (optional)"
                  value={form.address_line2}
                  onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
                  className="client-input w-full sm:col-span-2"
                />
                <input
                  placeholder="City"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="client-input w-full"
                />
                <div className="flex gap-3">
                  <select
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="client-input w-1/2"
                  >
                    <option value="">State…</option>
                    {US_STATES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    inputMode="numeric"
                    placeholder="ZIP code"
                    value={form.postal_code}
                    onChange={(e) => setForm({ ...form, postal_code: maskZip(e.target.value) })}
                    className="client-input w-1/2"
                  />
                </div>
              </div>
            </Section>

            <Section label="Team assignment">
              <div className="grid gap-3 sm:grid-cols-3">
                <StaffSelect
                  label="Relationship manager"
                  value={form.relationship_manager_id}
                  staff={staff}
                  onChange={(id) => setForm({ ...form, relationship_manager_id: id })}
                />
                <StaffSelect
                  label="Default reviewer"
                  value={form.default_reviewer_id}
                  staff={staff}
                  onChange={(id) => setForm({ ...form, default_reviewer_id: id })}
                />
                <StaffSelect
                  label="Compliance officer"
                  value={form.default_compliance_officer_id}
                  staff={staff}
                  onChange={(id) => setForm({ ...form, default_compliance_officer_id: id })}
                />
              </div>
            </Section>

            <Section label={`${isEntity ? "Business Tax ID (EIN)" : "Social Security Number (SSN)"}${!isEditing ? " (required)" : ""}`}>
              <p className="text-xs text-muted mb-2">
                We use this number to prepare this client&apos;s federal and state tax returns. Example:{" "}
                {isEntity ? "12-3456789" : "123-45-6789"}.
              </p>
              {isEditing && identityStage === "masked" && existingLast4 && (
                <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
                  <span className="font-mono text-ink">
                    {isEntity ? `••-•••${existingLast4}` : `•••-••-${existingLast4}`}
                  </span>
                  <button type="button" onClick={startReveal} className="text-xs font-semibold text-[#108A64] flex items-center gap-1">
                    <Eye size={13} /> Reveal
                  </button>
                </div>
              )}

              {isEditing && identityStage === "reveal" && (
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
                      <p className="text-xs text-muted">Confirm your password to view the full {identityLabel}.</p>
                      <input
                        type="password"
                        placeholder="Your account password"
                        value={identityPassword}
                        onChange={(e) => setIdentityPassword(e.target.value)}
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

              {!isEditing && identityStage === "input" && (
                <input
                  placeholder={isEntity ? "12-3456789" : "123-45-6789"}
                  inputMode="numeric"
                  value={newIdentityValue}
                  onChange={(e) => setNewIdentityValue(isEntity ? formatEIN(e.target.value) : formatSSN(e.target.value))}
                  className="client-input w-full"
                />
              )}

              {isEditing && !existingLast4 && (
                <p className="text-xs text-muted">
                  No {identityLabel} on file. Changing a client&apos;s {identityLabel} after creation isn&apos;t
                  available yet — contact support if this needs to be added.
                </p>
              )}
            </Section>

            {isEditing && (
              <Section label="Status">
                <select
                  value={form.lifecycle_status}
                  onChange={(e) => setForm({ ...form, lifecycle_status: e.target.value })}
                  className="client-input w-full"
                >
                  {LIFECYCLE_STATUSES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Section>
            )}

            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-xl px-3 py-2.5">{error}</div>
            )}
          </form>
        </div>

        <div
          className="shrink-0 border-t border-line bg-white px-6 py-4"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2">
            {isEditing && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
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
              form="client-form"
              disabled={saving}
              className="ml-auto text-sm font-semibold py-2.5 px-5 rounded-xl bg-[#108A64] text-white hover:bg-[#0d7555] disabled:opacity-60"
            >
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create"}
            </button>
          </div>
        </div>
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
      <ConfirmDialog
        open={confirmingDelete}
        title={client ? `Delete ${clientDisplayName(client)}?` : "Delete this client?"}
        description="This removes the client record but not their services, tasks, or deadlines — remove those first if you want a clean delete."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
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

function StaffSelect({
  label,
  value,
  staff,
  onChange,
}: {
  label: string;
  value: string;
  staff: StaffOption[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="client-input mt-1 w-full">
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.userId} value={s.userId}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
