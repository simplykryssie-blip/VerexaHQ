"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/EmptyState";
import { InlineAddForm } from "@/components/InlineAddForm";
import { DocumentWorkspace } from "@/components/documents/DocumentWorkspace";
import type { DocumentFolderRow, DocumentRow } from "@/components/documents/types";

const inputClass = "mt-1 w-full max-w-xs rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";
const cardClass = "rounded-2xl border border-border bg-surface p-4 shadow-soft";

type FirmInfo = { name: string; ownerName: string | null; phone: string | null; primaryContactEmail: string | null; website: string | null; mailingAddress: string | null };
type PackageOption = { id: string; name: string };
type PartnerOption = { id: string; name: string };
type Payout = {
  id: string;
  period_start: string;
  period_end: string;
  gross_prep_fees: number;
  gross_bank_product_rebates: number;
  gross_bank_fees: number;
  gross_addon_fees: number;
  gross_transmission_fees: number;
  gross_paperwork_fees: number;
  ero_share_amount: number;
  amount_owed_to_ptin: number;
  status: string;
  paid_at: string | null;
};

function money(n: number | null | undefined) {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Editable in place -- a manual firm has no workspace of its own to enter
// this, so the parent's own record IS the source of truth (unlike the
// read-only <dl> for a real workspace connection, whose firm controls these
// fields from their own Settings).
function ManualFirmInfo({ connectionId, firmInfo }: { connectionId: string; firmInfo: FirmInfo }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState(firmInfo.name);
  const [ownerName, setOwnerName] = useState(firmInfo.ownerName ?? "");
  const [phone, setPhone] = useState(firmInfo.phone ?? "");
  const [email, setEmail] = useState(firmInfo.primaryContactEmail ?? "");
  const [website, setWebsite] = useState(firmInfo.website ?? "");
  const [address, setAddress] = useState(firmInfo.mailingAddress ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.show("A firm name is required.", "error");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("update_manual_firm_connection", {
      p_connection_id: connectionId,
      p_name: name.trim(),
      p_owner_name: ownerName.trim() || undefined,
      p_phone: phone.trim() || undefined,
      p_email: email.trim() || undefined,
      p_website: website.trim() || undefined,
      p_address: address.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <label className={labelClass}>
        Firm name
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save} disabled={saving} className={`${inputClass} max-w-none`} />
      </label>
      <label className={labelClass}>
        Owner name
        <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} onBlur={save} disabled={saving} className={`${inputClass} max-w-none`} />
      </label>
      <label className={labelClass}>
        Contact email
        <input value={email} onChange={(e) => setEmail(e.target.value)} onBlur={save} disabled={saving} className={`${inputClass} max-w-none`} />
      </label>
      <label className={labelClass}>
        Phone
        <input value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={save} disabled={saving} className={`${inputClass} max-w-none`} />
      </label>
      <label className={labelClass}>
        Website
        <input value={website} onChange={(e) => setWebsite(e.target.value)} onBlur={save} disabled={saving} className={`${inputClass} max-w-none`} />
      </label>
      <label className={labelClass}>
        Mailing address
        <input value={address} onChange={(e) => setAddress(e.target.value)} onBlur={save} disabled={saving} className={`${inputClass} max-w-none`} />
      </label>
    </dl>
  );
}

function PackagePicker({ connectionId, packageId, packages }: { connectionId: string; packageId: string | null; packages: PackageOption[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function change(value: string) {
    setSaving(true);
    const { error } = await supabase.rpc("assign_firm_package", { p_connection_id: connectionId, p_package_id: (value || null) as never });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <label className={labelClass}>
      Package
      <select defaultValue={packageId ?? ""} onChange={(e) => change(e.target.value)} disabled={saving} className={inputClass}>
        <option value="">No package assigned</option>
        {packages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const REVENUE_SHARE_SCOPES: [string, string][] = [
  ["all_production", "All production (prep fees + net bank rebates)"],
  ["prep_fees_only", "Prep fees only"],
  ["bank_products_only", "Bank product rebates only"],
];

// What an ERO sees instead of a Package picker -- EROs split fees with their
// PTINs the same way a Service Bureau splits with EROs, but never sell a
// priced software/banking package, so this writes revenue_share_percent/
// scope directly rather than going through a package at all.
function SplitPercentInput({
  connectionId,
  revenueSharePercent,
  revenueShareScope,
}: {
  connectionId: string;
  revenueSharePercent: number | null;
  revenueShareScope: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [percent, setPercent] = useState(revenueSharePercent != null ? String(revenueSharePercent) : "");
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update(patch as never).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  function savePercent() {
    const trimmed = percent.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 100)) {
      toast.show("Enter a percentage between 0 and 100.", "error");
      return;
    }
    save({ revenue_share_percent: parsed });
  }

  return (
    <>
      <label className={labelClass}>
        Your split %
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          onBlur={savePercent}
          disabled={saving}
          placeholder="e.g. 20"
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Split applies to
        <select
          defaultValue={revenueShareScope ?? "all_production"}
          onChange={(e) => save({ revenue_share_scope: e.target.value })}
          disabled={saving}
          className={inputClass}
        >
          {REVENUE_SHARE_SCOPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

// Fees a preparer/ERO collects outside the base prep fee -- bank fee,
// add-on fee, transmission fee, paperwork fee. Purely informational (they
// don't affect the revenue-share split, which is prep fees + bank product
// rebates only) and only shown when a firm actually has one recorded --
// not every ERO offers bank products or charges these at all.
const OTHER_FEE_FIELDS: [string, string][] = [
  ["gross_bank_fees", "Bank fees"],
  ["gross_addon_fees", "Add-on fees"],
  ["gross_transmission_fees", "Transmission fees"],
  ["gross_paperwork_fees", "Paperwork fees"],
];

function BankPicker({ connectionId, bankPartnerId, banks }: { connectionId: string; bankPartnerId: string | null; banks: PartnerOption[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function change(value: string) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update({ bank_partner_id: value || null }).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <label className={labelClass}>
      Bank
      <select defaultValue={bankPartnerId ?? ""} onChange={(e) => change(e.target.value)} disabled={saving} className={inputClass}>
        <option value="">No bank assigned</option>
        {banks.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SoftwarePicker({
  connectionId,
  softwarePartnerId,
  softwareList,
}: {
  connectionId: string;
  softwarePartnerId: string | null;
  softwareList: PartnerOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function change(value: string) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update({ software_partner_id: value || null }).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <label className={labelClass}>
      Software
      <select defaultValue={softwarePartnerId ?? ""} onChange={(e) => change(e.target.value)} disabled={saving} className={inputClass}>
        <option value="">No software assigned</option>
        {softwareList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
};

const CONTACT_TITLE_OPTIONS = [
  { value: "Owner", label: "Owner" },
  { value: "Partner", label: "Partner" },
  { value: "Office Manager", label: "Office Manager" },
  { value: "other", label: "Other" },
];

function resolveContactTitle(v: Record<string, string>) {
  return v.title === "other" ? v.custom_title?.trim() || "Other" : v.title || null;
}

function AddFirmContactForm({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add a contact"
      fields={[
        { name: "first_name", label: "First name", required: true },
        { name: "last_name", label: "Last name", required: true },
        { name: "title", label: "Title", type: "select", options: CONTACT_TITLE_OPTIONS },
        { name: "custom_title", label: "Custom title", showIf: (v) => v.title === "other" },
        { name: "email", label: "Email" },
        { name: "phone", label: "Phone" },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("firm_connection_contacts").insert({
          connection_id: connectionId,
          first_name: v.first_name,
          last_name: v.last_name,
          title: resolveContactTitle(v),
          email: v.email || null,
          phone: v.phone || null,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

function EditFirmContactForm({ contact }: { contact: ContactRow }) {
  const router = useRouter();
  const supabase = createClient();
  const knownTitle = CONTACT_TITLE_OPTIONS.some((o) => o.value === contact.title);
  return (
    <InlineAddForm
      label="Edit"
      submitLabel="Save changes"
      initialValues={{
        first_name: contact.first_name ?? "",
        last_name: contact.last_name ?? "",
        title: contact.title ? (knownTitle ? contact.title : "other") : "",
        custom_title: contact.title && !knownTitle ? contact.title : "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
      }}
      fields={[
        { name: "first_name", label: "First name", required: true },
        { name: "last_name", label: "Last name", required: true },
        { name: "title", label: "Title", type: "select", options: CONTACT_TITLE_OPTIONS },
        { name: "custom_title", label: "Custom title", showIf: (v) => v.title === "other" },
        { name: "email", label: "Email" },
        { name: "phone", label: "Phone" },
      ]}
      trigger={(openForm) => (
        <button type="button" onClick={openForm} className="text-muted hover:text-ink" aria-label="Edit contact">
          <Pencil size={13} />
        </button>
      )}
      onSubmit={async (v) => {
        const { error } = await supabase
          .from("firm_connection_contacts")
          .update({
            first_name: v.first_name,
            last_name: v.last_name,
            title: resolveContactTitle(v),
            email: v.email || null,
            phone: v.phone || null,
          })
          .eq("id", contact.id);
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

function DeleteFirmContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const supabase = createClient();
  async function handleDelete() {
    if (!window.confirm("Delete this contact? This can't be undone.")) return;
    const { error } = await supabase.from("firm_connection_contacts").delete().eq("id", contactId);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }
  return (
    <button type="button" onClick={handleDelete} className="text-muted hover:text-danger" aria-label="Delete contact">
      <Trash2 size={13} />
    </button>
  );
}

function FirmContacts({ connectionId, contacts }: { connectionId: string; contacts: ContactRow[] }) {
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">Contacts</p>
        <AddFirmContactForm connectionId={connectionId} />
      </div>
      {contacts.length === 0 ? (
        <EmptyState message="No contacts yet." />
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {contacts.map((c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
            return (
              <li key={c.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate">
                    {name || "Unnamed contact"}
                    {c.title && <span className="ml-2 text-xs font-normal text-muted">{c.title}</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <EditFirmContactForm contact={c} />
                    <DeleteFirmContactButton contactId={c.id} />
                  </div>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted">
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type StaffOption = { id: string; display_name: string | null };
type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  due_date: string | null;
  status: string;
};

function AddFirmTaskForm({ connectionId, workspaceId, staffOptions }: { connectionId: string; workspaceId: string; staffOptions: StaffOption[] }) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Add Task"
      fields={[
        { name: "title", label: "Title", required: true },
        { name: "description", label: "Description", type: "richtext" },
        {
          name: "priority",
          label: "Priority",
          type: "select",
          options: [
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "critical", label: "Critical" },
          ],
        },
        {
          name: "assigned_staff_id",
          label: "Assigned to",
          type: "select",
          options: staffOptions.map((s) => ({ value: s.id, label: s.display_name ?? "Staff" })),
        },
        { name: "due_date", label: "Task due date" },
      ]}
      onSubmit={async (v) => {
        const description = v.description && v.description.replace(/<[^>]+>/g, "").trim() ? v.description : null;
        // Always internal -- there's no portal concept for a connected firm,
        // so a "visible to client" option here would silently show nothing.
        const { error } = await supabase.from("tasks").insert({
          workspace_id: workspaceId,
          firm_connection_id: connectionId,
          title: v.title,
          description,
          priority: v.priority || null,
          assigned_staff_id: v.assigned_staff_id || null,
          due_date: v.due_date || null,
          visibility: "internal",
          status: "pending",
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

function FirmTasks({
  connectionId,
  workspaceId,
  tasks,
  staffOptions,
}: {
  connectionId: string;
  workspaceId: string;
  tasks: TaskRow[];
  staffOptions: StaffOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function complete(task: TaskRow) {
    setPendingId(task.id);
    const { error } = await supabase.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.id);
    setPendingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Task completed", "success");
    router.refresh();
  }

  const open = tasks.filter((t) => t.status !== "completed");

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">Tasks</p>
        <AddFirmTaskForm connectionId={connectionId} workspaceId={workspaceId} staffOptions={staffOptions} />
      </div>
      {open.length === 0 ? (
        <EmptyState message="No open tasks for this firm." />
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {open.map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-3">
              <input
                type="checkbox"
                disabled={pendingId === t.id}
                onChange={() => complete(t)}
                className="mt-1 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                aria-label={`Mark "${t.title}" complete`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-ink">{t.title}</p>
                  {t.priority && <span className="text-xs capitalize text-muted">({t.priority})</span>}
                </div>
                {t.due_date && <p className="mt-1 text-xs text-muted">Due {new Date(t.due_date).toLocaleDateString()}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Your own record of this firm -- software packages, tax programs, general
// notes -- separate from anything the firm enters about itself. Saved as
// comma-separated free text and parsed into an array, matching the level of
// input control the rest of this page uses (no bespoke tag-picker widget
// for what's normally a handful of short entries).
function arrayToText(values: string[] | null | undefined) {
  return (values ?? []).join(", ");
}
function textToArray(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function PartnerAdminNotes({
  connectionId,
  partnerSoftwareUsed,
  partnerTaxPrograms,
  notes,
}: {
  connectionId: string;
  partnerSoftwareUsed: string[];
  partnerTaxPrograms: string[];
  notes: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [softwareText, setSoftwareText] = useState(arrayToText(partnerSoftwareUsed));
  const [taxProgramsText, setTaxProgramsText] = useState(arrayToText(partnerTaxPrograms));
  const [notesText, setNotesText] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update(patch as never).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className={cardClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink">Your notes on this firm</p>
      <p className="mt-1 text-xs text-muted">Private to you -- the firm doesn&apos;t see or control any of this.</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Software packages
          <input
            type="text"
            value={softwareText}
            onChange={(e) => setSoftwareText(e.target.value)}
            onBlur={() => save({ partner_software_used: textToArray(softwareText) })}
            placeholder="e.g. QuickBooks, Gusto"
            disabled={saving}
            className={`${inputClass} max-w-none`}
          />
        </label>
        <label className={labelClass}>
          Tax programs
          <input
            type="text"
            value={taxProgramsText}
            onChange={(e) => setTaxProgramsText(e.target.value)}
            onBlur={() => save({ partner_tax_programs: textToArray(taxProgramsText) })}
            placeholder="e.g. Drake, ProSeries"
            disabled={saving}
            className={`${inputClass} max-w-none`}
          />
        </label>
      </div>
      <label className={`${labelClass} mt-4 block`}>
        Notes
        <textarea
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          onBlur={() => save({ notes: notesText.trim() || null })}
          rows={3}
          disabled={saving}
          className={`${inputClass} max-w-none`}
        />
      </label>
    </div>
  );
}

const ONBOARDING_STAGES: [string, string][] = [
  ["invited", "Invited"],
  ["agreement_signed", "Agreement signed"],
  ["software_provisioned", "Software provisioned"],
  ["live", "Live"],
];
const PREPARER_CREDENTIALS: [string, string][] = [
  ["ea", "Enrolled Agent (EA)"],
  ["cpa", "CPA"],
  ["attorney", "Attorney"],
  ["unenrolled", "Unenrolled preparer"],
  ["other", "Other"],
];

// The one-stop card for everything specific to *this kind* of partner --
// EFIN/PTIN last-4 comes read-only from their own firm_tax_profile (they
// control the real number; you're only ever shown the last 4 for
// identification), while onboarding stage, credential, and "files under"
// are your own record, same privacy stance as PartnerAdminNotes below.
function PartnerDetails({
  connectionId,
  relationshipType,
  efinLast4,
  ptinLast4,
  onboardingStage,
  preparerCredential,
  filedUnderConnectionId,
  eroOptions,
  downstreamPtinCount,
}: {
  connectionId: string;
  relationshipType: string;
  efinLast4: string | null;
  ptinLast4: string | null;
  onboardingStage: string | null;
  preparerCredential: string | null;
  filedUnderConnectionId: string | null;
  eroOptions: PartnerOption[];
  downstreamPtinCount: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const isEro = relationshipType === "service_bureau_ero";
  const isPtin = relationshipType === "service_bureau_ptin" || relationshipType === "ero_ptin";

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    const { error } = await supabase.from("firm_connections").update(patch as never).eq("id", connectionId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className={cardClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink">{isEro ? "ERO details" : isPtin ? "PTIN details" : "Partner details"}</p>
      <p className="mt-1 text-xs text-muted">Onboarding stage, credential, and filing links are your own record -- the firm doesn&apos;t see or control any of this.</p>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {isEro && (
          <>
            <div>
              <dt className={labelClass}>EFIN on file</dt>
              <dd className="text-slate">{efinLast4 ? `••••${efinLast4}` : "Not disclosed"}</dd>
            </div>
            <div>
              <dt className={labelClass}>Connected PTINs under them</dt>
              <dd className="text-slate">{downstreamPtinCount ?? 0}</dd>
            </div>
          </>
        )}
        {isPtin && (
          <div>
            <dt className={labelClass}>PTIN on file</dt>
            <dd className="text-slate">{ptinLast4 ? `••••${ptinLast4}` : "Not disclosed"}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <label className={labelClass}>
          Onboarding stage
          <select
            defaultValue={onboardingStage ?? ""}
            onChange={(e) => save({ onboarding_stage: e.target.value || null })}
            disabled={saving}
            className={inputClass}
          >
            <option value="">Not set</option>
            {ONBOARDING_STAGES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {isPtin && (
          <>
            <label className={labelClass}>
              Credential
              <select
                defaultValue={preparerCredential ?? ""}
                onChange={(e) => save({ preparer_credential: e.target.value || null })}
                disabled={saving}
                className={inputClass}
              >
                <option value="">Not set</option>
                {PREPARER_CREDENTIALS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Files under
              <select
                defaultValue={filedUnderConnectionId ?? ""}
                onChange={(e) => save({ filed_under_connection_id: e.target.value || null })}
                disabled={saving}
                className={inputClass}
              >
                <option value="">No connected ERO</option>
                {eroOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

function ProductionStats({ production }: { production: Record<string, unknown> | null }) {
  if (!production) {
    return <p className="text-sm text-muted">Production data isn&apos;t available until the connection is active.</p>;
  }
  const engagementsByStatus = (production.engagements_by_status as Record<string, number>) ?? {};
  const bankProducts = (production.bank_products as { product_type: string; bank_partner: string; count: number; total_rebate: number }[]) ?? [];
  const otherFees = OTHER_FEE_FIELDS.filter(([key]) => Number(production[key] ?? 0) > 0);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">This period</p>
        <p className="mt-1 text-xs text-muted">
          {String(production.period_start)} - {String(production.period_end)}
        </p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Active clients</dt>
            <dd className="font-medium text-slate">{String(production.active_clients ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Returns completed</dt>
            <dd className="font-medium text-slate">{String(production.returns_completed ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Prep fees collected</dt>
            <dd className="font-medium text-slate">{money(production.gross_prep_fees as number)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Bank product rebates</dt>
            <dd className="font-medium text-slate">{money(production.gross_bank_product_rebates as number)}</dd>
          </div>
        </dl>
        {otherFees.length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Other fees collected (not split)</p>
            <dl className="mt-1.5 space-y-1 text-xs text-slate">
              {otherFees.map(([key, label]) => (
                <div key={key} className="flex justify-between">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-medium">{money(production[key] as number)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {Object.keys(engagementsByStatus).length > 0 && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Engagements by status</p>
            <ul className="mt-1.5 space-y-1 text-xs text-slate">
              {Object.entries(engagementsByStatus).map(([status, count]) => (
                <li key={status} className="flex justify-between">
                  <span className="text-muted">{status}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Bank products</p>
        {bankProducts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None recorded this period.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {bankProducts.map((b, i) => (
              <li key={i} className="flex items-center justify-between">
                <span className="text-slate">
                  {b.bank_partner} <span className="text-muted">({b.product_type.replace("_", " ")})</span>
                </span>
                <span className="text-right">
                  <span className="block font-medium text-slate">{b.count}</span>
                  <span className="block text-xs text-muted">{money(b.total_rebate)} rebate</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PayoutLedger({ connectionId, payouts, hasRevenueShare }: { connectionId: string; payouts: Payout[]; hasRevenueShare: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  async function generateThisMonth() {
    setGenerating(true);
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const periodEnd = now.toISOString().slice(0, 10);
    const { error } = await supabase.rpc("generate_firm_payout", {
      p_connection_id: connectionId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    setGenerating(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Payout calculated for this month", "success");
    router.refresh();
  }

  async function markPaid(payoutId: string) {
    if (!window.confirm("Mark this payout as paid? This only records that you've sent the money outside Verexa -- it doesn't move any funds.")) return;
    setMarkingPaid(payoutId);
    const { error } = await supabase.rpc("mark_firm_payout_paid", { p_payout_id: payoutId });
    setMarkingPaid(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Marked paid", "success");
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Payout ledger</p>
        <button
          type="button"
          onClick={generateThisMonth}
          disabled={generating}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
        >
          {generating ? "Calculating..." : "Calculate this month"}
        </button>
      </div>
      {!hasRevenueShare && (
        <p className="mt-2 text-xs text-warning">No revenue split set -- payouts will calculate at 0% until one is configured.</p>
      )}
      {payouts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No payouts calculated yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-right">Gross collected</th>
                <th className="px-3 py-2 text-right">Fees deducted</th>
                <th className="px-3 py-2 text-right">Net production</th>
                <th className="px-3 py-2 text-right">Your share</th>
                <th className="px-3 py-2 text-right">Owed to firm</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payouts.map((p) => {
                const grossCollected = p.gross_prep_fees + p.gross_bank_product_rebates;
                const feesDeducted = p.gross_bank_fees + p.gross_addon_fees + p.gross_transmission_fees + p.gross_paperwork_fees;
                // Derived from the two numbers the split actually came from
                // (ero_share_amount + amount_owed_to_ptin), rather than
                // grossCollected - feesDeducted, so this always matches
                // exactly what generate_firm_payout computed -- the fee
                // deduction floors at 0 server-side and this stays in sync
                // with that even in the rare case fees exceed rebates.
                const netProduction = p.ero_share_amount + p.amount_owed_to_ptin;
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-slate">
                      {p.period_start} - {p.period_end}
                    </td>
                    <td className="px-3 py-2 text-right text-slate">{money(grossCollected)}</td>
                    <td className="px-3 py-2 text-right text-slate">{feesDeducted > 0 ? `-${money(feesDeducted)}` : money(0)}</td>
                    <td className="px-3 py-2 text-right text-slate">{money(netProduction)}</td>
                    <td className="px-3 py-2 text-right text-slate">{money(p.ero_share_amount)}</td>
                    <td className="px-3 py-2 text-right font-medium text-ink">{money(p.amount_owed_to_ptin)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={p.status === "paid" ? "success" : p.status === "disputed" ? "danger" : "neutral"}>{p.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.status === "pending" && (
                        <button
                          type="button"
                          onClick={() => markPaid(p.id)}
                          disabled={markingPaid === p.id}
                          className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
                        >
                          {markingPaid === p.id ? "Saving..." : "Mark paid"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FirmDetailClient({
  connectionId,
  relationshipType,
  source,
  firmInfo,
  canAssignPackages,
  packageId,
  packages,
  revenueSharePercent,
  revenueShareScope,
  bankPartnerId,
  banks,
  softwarePartnerId,
  softwareList,
  partnerSoftwareUsed,
  partnerTaxPrograms,
  notes,
  efinLast4,
  ptinLast4,
  onboardingStage,
  preparerCredential,
  filedUnderConnectionId,
  eroOptions,
  downstreamPtinCount,
  production,
  payouts,
  isActive,
  contacts,
  workspaceId,
  documentFolders,
  documents,
  firmName,
  tasks,
  staffOptions,
}: {
  connectionId: string;
  parentWorkspaceId: string;
  relationshipType: string;
  source: string;
  firmInfo: FirmInfo;
  canAssignPackages: boolean;
  packageId: string | null;
  packages: PackageOption[];
  revenueSharePercent: number | null;
  revenueShareScope: string | null;
  bankPartnerId: string | null;
  banks: PartnerOption[];
  softwarePartnerId: string | null;
  softwareList: PartnerOption[];
  partnerSoftwareUsed: string[];
  partnerTaxPrograms: string[];
  notes: string | null;
  efinLast4: string | null;
  ptinLast4: string | null;
  onboardingStage: string | null;
  preparerCredential: string | null;
  filedUnderConnectionId: string | null;
  eroOptions: PartnerOption[];
  downstreamPtinCount: number | null;
  production: Record<string, unknown> | null;
  payouts: Payout[];
  isActive: boolean;
  contacts: ContactRow[];
  workspaceId: string;
  documentFolders: DocumentFolderRow[];
  documents: DocumentRow[];
  firmName: string;
  tasks: TaskRow[];
  staffOptions: StaffOption[];
}) {
  return (
    <div className="mt-4 space-y-6">
      <div className={cardClass}>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">Firm info</p>
        {source === "manual" ? (
          <>
            <p className="mt-1 text-xs text-muted">This firm doesn&apos;t use VerexaHQ -- you keep this info up to date yourself.</p>
            <ManualFirmInfo connectionId={connectionId} firmInfo={firmInfo} />
          </>
        ) : (
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className={labelClass}>Owner name</dt>
              <dd className="text-slate">{firmInfo.ownerName ?? "--"}</dd>
            </div>
            <div>
              <dt className={labelClass}>Contact email</dt>
              <dd className="text-slate">{firmInfo.primaryContactEmail ?? "--"}</dd>
            </div>
            <div>
              <dt className={labelClass}>Phone</dt>
              <dd className="text-slate">{firmInfo.phone ?? "--"}</dd>
            </div>
            <div>
              <dt className={labelClass}>Website</dt>
              <dd className="text-slate">{firmInfo.website ?? "--"}</dd>
            </div>
            <div>
              <dt className={labelClass}>Mailing address</dt>
              <dd className="text-slate">{firmInfo.mailingAddress ?? "--"}</dd>
            </div>
          </dl>
        )}
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
          {canAssignPackages ? (
            <PackagePicker connectionId={connectionId} packageId={packageId} packages={packages} />
          ) : (
            <SplitPercentInput connectionId={connectionId} revenueSharePercent={revenueSharePercent} revenueShareScope={revenueShareScope} />
          )}
          <BankPicker connectionId={connectionId} bankPartnerId={bankPartnerId} banks={banks} />
          <SoftwarePicker connectionId={connectionId} softwarePartnerId={softwarePartnerId} softwareList={softwareList} />
        </div>
      </div>

      <PartnerDetails
        connectionId={connectionId}
        relationshipType={relationshipType}
        efinLast4={efinLast4}
        ptinLast4={ptinLast4}
        onboardingStage={onboardingStage}
        preparerCredential={preparerCredential}
        filedUnderConnectionId={filedUnderConnectionId}
        eroOptions={eroOptions}
        downstreamPtinCount={downstreamPtinCount}
      />

      <FirmContacts connectionId={connectionId} contacts={contacts} />

      <FirmTasks connectionId={connectionId} workspaceId={workspaceId} tasks={tasks} staffOptions={staffOptions} />

      <PartnerAdminNotes
        connectionId={connectionId}
        partnerSoftwareUsed={partnerSoftwareUsed}
        partnerTaxPrograms={partnerTaxPrograms}
        notes={notes}
      />

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">Documents</p>
        <DocumentWorkspace
          workspaceId={workspaceId}
          entityType="firm_connection"
          entityId={connectionId}
          folders={documentFolders}
          documents={documents}
          requests={[]}
          requestTemplates={[]}
          signatureRequests={[]}
          signatureTemplates={[]}
          clientName={firmInfo.name}
          clientEmail={firmInfo.primaryContactEmail}
          firmName={firmName}
          activity={[]}
          canRequestDocuments={false}
          canRequestSignatures={false}
          additionalSigners={[]}
        />
      </div>

      {source === "manual" ? (
        <div className={cardClass}>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Production &amp; payouts</p>
          <p className="mt-1 text-xs text-muted">
            Not available for a manually-added firm -- production and payouts are calculated from activity in a connected VerexaHQ workspace, which this
            firm doesn&apos;t have.
          </p>
        </div>
      ) : (
        <>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">Production</p>
            <ProductionStats production={production} />
          </div>

          <div>
            <PayoutLedger connectionId={connectionId} payouts={payouts} hasRevenueShare={revenueSharePercent != null} />
          </div>
        </>
      )}
    </div>
  );
}
