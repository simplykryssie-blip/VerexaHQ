"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Pencil,
  UserPlus,
  Upload,
  Download,
  Mail,
  Phone,
  MapPin,
  Cake,
  ShieldCheck,
  Star,
  Tag,
  MoreHorizontal,
  ClipboardList,
  FileText,
  MessageSquare,
  Receipt,
  StickyNote,
  Info,
  Users,
  Link2,
  Trash2,
  Eye,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Client,
  Contact,
  Service,
  ClientServiceInterest,
  Task,
  Deadline,
  Document,
  DocumentFolder,
  ClientTag,
  Invoice,
  InvoicePayment,
} from "@/lib/types";
import { clientDisplayName, clientInitials, accountTypeMeta } from "@/lib/clientDisplay";
import { isOpenServiceStatus, isDocumentAwaitingClient, isOpenTaskStatus } from "@/lib/status";
import { friendlyError } from "@/lib/friendlyError";
import { getStaffNames } from "@/lib/workspaceMembers";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import StatusPill from "@/components/StatusPill";
import NewTaskModal from "@/components/NewTaskModal";
import NewDeadlineModal from "@/components/NewDeadlineModal";
import NewServiceModal from "@/components/NewServiceModal";
import ActivateServiceModal from "@/components/ActivateServiceModal";
import ClientModal from "@/components/ClientModal";
import ContactDetailModal from "@/components/ContactDetailModal";
import InvitePortalModal from "@/components/InvitePortalModal";
import UploadDocumentModal from "@/components/UploadDocumentModal";
import RequestDocumentModal from "@/components/RequestDocumentModal";
import DocumentFolderModal from "@/components/DocumentFolderModal";
import NewInvoiceModal from "@/components/NewInvoiceModal";

type LinkedClientSummary = { id: string; client_type: string; status: string };
type ContactWithLinks = Contact & {
  account_contacts?: { account_id: string; is_primary: boolean; clients: LinkedClientSummary | null }[];
};
type LinkedContact = {
  id: string;
  contact_id: string;
  relationship_type: string | null;
  is_primary: boolean;
  portal_access: boolean;
  contacts: ContactWithLinks | null;
};
type TeamMember = { user_id: string; label: string };
type MaskedIdentity = { vault_id: string; identity_type: string; masked_value: string; last_four: string | null };
type CommMessage = {
  id: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  message_status: string;
  to_address: string | null;
  from_address: string | null;
  sent_at: string | null;
  created_at: string;
};
type Note = { id: string; note_body: string; created_by: string | null; created_at: string };
type EngagementSummary = { id: string; service_id: string | null; engagement_name: string; tax_year: number | null; status: string };

const TABS = ["overview", "work", "documents", "communication", "billing", "notes", "details"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  work: "Work",
  documents: "Documents",
  communication: "Communication",
  billing: "Billing",
  notes: "Notes",
  details: "Details",
};

// A person linked via account_contacts is never a separate client account —
// they're a contact person, so their label comes from the relationship to
// the parent account (business vs. not), never from client_type/account_type
// as if the contact themself were the client.
function contactRoleLabel(parentClientType: string, isPrimary: boolean): string {
  if (parentClientType === "business") return isPrimary ? "Primary Business Contact" : "Business Contact";
  return isPrimary ? "Primary Contact" : "Contact";
}

function isAlsoIndividualClient(c: ContactWithLinks | null): LinkedClientSummary | null {
  if (!c) return null;
  const link = (c.account_contacts ?? []).find((ac) => ac.is_primary && ac.clients?.client_type === "individual");
  return link?.clients ?? null;
}

function humanizeServiceType(code: string, labels: Map<string, string>): string {
  const known = labels.get(code);
  if (known) return known;
  return code
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

type TaskGroup = {
  key: string;
  label: string;
  subtitle: string | null;
  statusLabel: string | null;
  engagementId: string | null;
  // True only for the engagement-fallback tier (service_id is gone but the
  // engagement itself still exists) and the general bucket — a visible
  // signal that a group's own service record no longer exists, most often
  // because a duplicate service was manually deleted without its
  // engagement/tasks being cleaned up alongside it (deleting a `services`
  // row does not cascade to `engagements`/`tasks` — the FK just goes
  // null). Never used to hide anything, only to label it honestly.
  orphaned: boolean;
  tasks: Task[];
};

// Groups by service_id first (the real, current source of truth), then
// falls back to engagement_id for tasks whose service record is gone but
// whose engagement still exists, then a single "General client tasks"
// bucket for tasks with neither — never by task_title, which is why
// same-named tasks from different services were indistinguishable before.
function groupTasksByService(
  tasks: Task[],
  services: Service[],
  engagements: EngagementSummary[],
  serviceEngagements: Map<string, string>,
  serviceTypeLabels: Map<string, string>
): TaskGroup[] {
  const servicesById = new Map(services.map((s) => [s.id, s]));
  const engagementsById = new Map(engagements.map((e) => [e.id, e]));
  const groups = new Map<string, TaskGroup>();

  for (const t of tasks) {
    let key: string;
    let group: TaskGroup;

    if (t.service_id && servicesById.has(t.service_id)) {
      const s = servicesById.get(t.service_id)!;
      key = `service:${s.id}`;
      group = groups.get(key) ?? {
        key,
        label: humanizeServiceType(s.service_type, serviceTypeLabels),
        subtitle: s.service_year || null,
        statusLabel: s.service_status,
        engagementId: serviceEngagements.get(s.id) ?? null,
        orphaned: false,
        tasks: [],
      };
    } else if (t.engagement_id && engagementsById.has(t.engagement_id)) {
      const e = engagementsById.get(t.engagement_id)!;
      key = `engagement:${e.id}`;
      group = groups.get(key) ?? {
        key,
        label: e.engagement_name,
        subtitle: e.tax_year ? String(e.tax_year) : null,
        statusLabel: e.status,
        engagementId: e.id,
        orphaned: true,
        tasks: [],
      };
    } else {
      key = "general";
      group = groups.get(key) ?? {
        key,
        label: "General client tasks",
        subtitle: null,
        statusLabel: null,
        engagementId: null,
        orphaned: false,
        tasks: [],
      };
    }

    if (!groups.has(key)) groups.set(key, group);
    group.tasks.push(t);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.key === "general") return 1;
    if (b.key === "general") return -1;
    return a.label.localeCompare(b.label);
  });
}

function orderFoldersByTree(folders: DocumentFolder[]): { folder: DocumentFolder; depth: number }[] {
  const byParent = new Map<string, DocumentFolder[]>();
  for (const f of folders) {
    const key = f.parent_folder_id ?? "root";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(f);
  }
  const result: { folder: DocumentFolder; depth: number }[] = [];
  function walk(parentKey: string, depth: number) {
    const children = byParent.get(parentKey) ?? [];
    for (const f of children) {
      result.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  }
  walk("root", 0);
  return result;
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceEngagements, setServiceEngagements] = useState<Map<string, string>>(new Map());
  // Full engagement rows (not just the service_id -> id map above) so
  // tasks whose own service_id has since gone null (the service record it
  // pointed to was deleted, leaving the engagement orphaned via
  // ON DELETE SET NULL) can still be grouped and labeled sensibly by
  // their engagement instead of being dumped into "General client tasks".
  const [engagementSummaries, setEngagementSummaries] = useState<EngagementSummary[]>([]);
  // Requested Services (client_service_interests) are separate from real,
  // activated Services — a service_type here never implies a `services` row
  // exists. "Activated" is derived by matching service_type against
  // `services`, not from service_interests.service_status, since
  // save_workspace_client resets that column to 'interested' on every
  // client resave.
  const [serviceInterests, setServiceInterests] = useState<ClientServiceInterest[]>([]);
  const [serviceTypeLabels, setServiceTypeLabels] = useState<Map<string, string>>(new Map());
  const [contacts, setContacts] = useState<LinkedContact[]>([]);
  const [viewingContact, setViewingContact] = useState<{ link: LinkedContact; edit: boolean } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tags, setTags] = useState<ClientTag[]>([]);
  const [maskedIdentities, setMaskedIdentities] = useState<MaskedIdentity[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const [showClientModal, setShowClientModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [openContactMenuId, setOpenContactMenuId] = useState<string | null>(null);
  const [invitingContact, setInvitingContact] = useState<ContactWithLinks | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  // Set when "Activate" is clicked on a specific Requested Service row, so
  // the modal can preselect the matching template and show which request
  // triggered it. null means either closed, or opened via the plain
  // "Add service" action (showActivateModal) with no preselection.
  const [activatingRequestedService, setActivatingRequestedService] = useState<{
    serviceType: string;
    label: string;
  } | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const { showSuccess, showError } = useToast();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [contactActionError, setContactActionError] = useState<string | null>(null);
  const [removeContactTarget, setRemoveContactTarget] = useState<LinkedContact | null>(null);
  const [removingContact, setRemovingContact] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // The actual fetch — shared by both entry points below. Never toggles
  // `loading` itself: `loading` gates the page's *only* render branch
  // (see `if (loading) return ...` further down), which unmounts this
  // entire tree, including any modal that's still open above it (e.g.
  // ActivateServiceModal, which deliberately stays open across an
  // activation). Toggling it mid-flow caused the tree — and whatever
  // modal was open — to unmount and then remount from scratch once the
  // fetch finished, wiping out the modal's own state and any props like
  // `initialServiceType`, which is what silently reset activation back to
  // its first step after every successful save.
  async function fetchClientData() {
    const clientRes = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
    if (clientRes.error) {
      setError(clientRes.error.message);
      return;
    }
    if (!clientRes.data) {
      setClient(null);
      return;
    }
    const c = clientRes.data as Client;
    setClient(c);

    const [
      servicesRes,
      engagementsRes,
      serviceInterestsRes,
      serviceTypeOptionsRes,
      contactsRes,
      tasksRes,
      deadlinesRes,
      documentsRes,
      foldersRes,
      teamRes,
      tagAssignmentsRes,
      workspaceTagsRes,
      identityRes,
      invoicesRes,
      paymentsRes,
      messagesRes,
      notesRes,
    ] = await Promise.all([
      supabase.from("services").select("*").eq("client_id", id),
      supabase.from("engagements").select("id, service_id, engagement_name, tax_year, status").eq("account_id", id),
      supabase.from("client_service_interests").select("*").eq("client_id", id).order("created_at"),
      // Not filtered to is_active — a requested service saved under a code
      // that's since been deactivated should still resolve to its real
      // label instead of falling back to the raw code.
      supabase.from("client_setup_options").select("option_code, option_label").eq("option_group", "client_service_type"),
      supabase
        .from("account_contacts")
        .select(
          "id, contact_id, relationship_type, is_primary, portal_access, contacts(*, account_contacts(account_id, is_primary, clients(id, client_type, status)))"
        )
        .eq("account_id", id)
        .order("is_primary", { ascending: false }),
      supabase.from("tasks").select("*").eq("client_id", id).order("due_date"),
      supabase.from("deadlines").select("*").eq("client_id", id).order("due_date"),
      supabase.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("document_folders").select("*").eq("client_id", id).order("sort_order"),
      supabase.from("client_team_members").select("user_id").eq("client_id", id),
      supabase.from("client_tag_assignments").select("tag_id").eq("client_id", id),
      supabase.from("client_tags").select("*").eq("workspace_id", c.workspace_id).eq("is_active", true),
      supabase.rpc("get_client_identity_vault_masked", { p_workspace_id: c.workspace_id, p_client_id: id }),
      supabase.from("invoices").select("*").eq("client_id", id).order("issue_date", { ascending: false }),
      supabase.from("invoice_payments").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(5),
      supabase.from("communication_messages").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(15),
      supabase.from("notes").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    ]);

    setServices((servicesRes.data as Service[]) ?? []);
    const engMap = new Map<string, string>();
    (engagementsRes.data ?? []).forEach((e: any) => {
      if (e.service_id) engMap.set(e.service_id, e.id);
    });
    setServiceEngagements(engMap);
    setEngagementSummaries((engagementsRes.data as EngagementSummary[]) ?? []);
    setServiceInterests((serviceInterestsRes.data as ClientServiceInterest[]) ?? []);
    setServiceTypeLabels(
      new Map(((serviceTypeOptionsRes.data as { option_code: string; option_label: string }[]) ?? []).map((o) => [o.option_code, o.option_label]))
    );
    setContacts((contactsRes.data as unknown as LinkedContact[]) ?? []);
    setTasks((tasksRes.data as Task[]) ?? []);
    setDeadlines((deadlinesRes.data as Deadline[]) ?? []);
    setDocuments((documentsRes.data as Document[]) ?? []);
    setFolders((foldersRes.data as DocumentFolder[]) ?? []);

    const memberIds = Array.from(new Set(((teamRes.data as any[]) ?? []).map((r) => r.user_id as string)));
    const memberNames = await getStaffNames(memberIds);
    setTeam(memberIds.map((userId) => ({ user_id: userId, label: memberNames.get(userId) ?? "Team member" })));

    const tagIds = new Set(((tagAssignmentsRes.data as any[]) ?? []).map((r) => r.tag_id));
    setTags(((workspaceTagsRes.data as ClientTag[]) ?? []).filter((t) => tagIds.has(t.id)));

    setMaskedIdentities((identityRes.data as MaskedIdentity[]) ?? []);
    setInvoices((invoicesRes.data as Invoice[]) ?? []);
    setPayments((paymentsRes.data as InvoicePayment[]) ?? []);
    setMessages((messagesRes.data as CommMessage[]) ?? []);
    setNotes((notesRes.data as Note[]) ?? []);

    setError(null);
  }

  // Initial page load only — this is the one place a full-page "Loading
  // client…" state is appropriate, since there's nothing meaningful to
  // show yet anyway.
  async function load() {
    setLoading(true);
    await fetchClientData();
    setLoading(false);
  }

  // Used by every in-place save/activate/delete callback below instead of
  // `load()`, so refreshing data while a modal is open can never unmount
  // (and silently reset) that modal.
  async function refresh() {
    await fetchClientData();
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  // Refreshes this page's data (never the loading-toggling `load()`, so
  // the still-open ActivateServiceModal doesn't get unmounted mid-flow —
  // see fetchClientData's comment) and surfaces a lightweight success
  // message, then the modal closes itself right after calling this.
  async function handleServiceActivated(serviceName: string) {
    await refresh();
    showSuccess(`${serviceName} activated successfully.`);
  }

  async function toggleTask(task: Task) {
    const nextStatus = task.task_status === "Completed" ? "To Do" : "Completed";
    const { error } = await supabase
      .from("tasks")
      .update({
        task_status: nextStatus,
        completed_at: nextStatus === "Completed" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (!error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, task_status: nextStatus } : t)));
    } else {
      showError(friendlyError(error, "Couldn't update that task. Please try again."));
    }
  }

  async function downloadDocument(doc: Document) {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage.from("verexahq-client-documents").createSignedUrl(doc.storage_path, 60);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  async function moveDocumentToFolder(doc: Document, folderId: string) {
    const { error } = await supabase.from("documents").update({ folder_id: folderId || null }).eq("id", doc.id);
    if (!error) {
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, folder_id: folderId || null } : d)));
    }
  }

  async function addNote() {
    if (!client || !newNote.trim()) return;
    setSavingNote(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const { error } = await supabase.from("notes").insert({
      workspace_id: client.workspace_id,
      client_id: client.id,
      note_body: newNote.trim(),
      created_by: sessionData.session?.user.id ?? null,
    });
    setSavingNote(false);
    if (!error) {
      setNewNote("");
      load();
    }
  }

  // Retires whichever link currently holds is_primary for this account
  // *before* promoting the target — account_contacts has partial unique
  // indexes allowing at most one is_primary = true row per account_id, so
  // promoting the new one first (before the old one is demoted) hits a
  // 23505 unique violation. The former primary is demoted to "additional",
  // never deleted, so no data is lost.
  async function makePrimary(target: LinkedContact) {
    if (!client) return;
    setContactActionError(null);
    const current = contacts.find((c) => c.is_primary && c.id !== target.id);
    if (current) {
      const { error: demoteError } = await supabase
        .from("account_contacts")
        .update({ is_primary: false, relationship_type: "additional" })
        .eq("id", current.id);
      if (demoteError) {
        setContactActionError(friendlyError(demoteError, "Something went wrong. Please try again."));
        return;
      }
    }
    const { error: promoteError } = await supabase
      .from("account_contacts")
      .update({ is_primary: true, relationship_type: "primary" })
      .eq("id", target.id);
    if (promoteError) {
      setContactActionError(friendlyError(promoteError, "Something went wrong. Please try again."));
      return;
    }
    load();
  }

  function removeContact(link: LinkedContact) {
    setRemoveContactTarget(link);
  }

  async function confirmRemoveContact() {
    if (!removeContactTarget) return;
    setContactActionError(null);
    setRemovingContact(true);
    const { error } = await supabase.from("account_contacts").delete().eq("id", removeContactTarget.id);
    setRemovingContact(false);
    setRemoveContactTarget(null);
    if (error) {
      setContactActionError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    showSuccess("Contact removed from this account.");
    load();
  }

  if (loading) {
    return <div className="text-sm text-muted">Loading client…</div>;
  }

  if (error || !client) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? "Client not found."}
      </div>
    );
  }

  const isBusiness = client.client_type === "business";
  // Same "activated" derivation as RequestedServicesCard, computed once
  // here so the still-open ActivateServiceModal can offer the next
  // requested service without staff having to close and reopen it.
  const remainingRequestedServices = serviceInterests
    .filter((i) => !services.some((s) => s.service_type === i.service_type))
    .map((i) => ({ serviceType: i.service_type, label: serviceTypeLabels.get(i.service_type) || i.service_type }));
  const taskGroups = groupTasksByService(tasks, services, engagementSummaries, serviceEngagements, serviceTypeLabels);
  const taskLabelById = new Map<string, string>();
  taskGroups.forEach((g) => {
    const full = g.subtitle ? `${g.label} — ${g.subtitle}` : g.label;
    g.tasks.forEach((t) => taskLabelById.set(t.id, full));
  });
  const displayName = clientDisplayName(client);
  const meta = accountTypeMeta(client);
  const address = [client.address, [client.city, client.state, client.zip_code].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
  const primaryLink = contacts.find((c) => c.is_primary);
  const primaryContactName = primaryLink?.contacts
    ? [primaryLink.contacts.first_name, primaryLink.contacts.last_name].filter(Boolean).join(" ")
    : null;
  const identityType = isBusiness ? "ein" : "ssn";
  const maskedIdentity = maskedIdentities.find((m) => m.identity_type === identityType) ?? maskedIdentities[0];
  const openDocs = documents.filter((d) => isDocumentAwaitingClient(d.document_status));
  const openTasksAndDeadlines = [
    ...tasks.filter((t) => isOpenTaskStatus(t.task_status)).map((t) => ({ kind: "task" as const, id: t.id, title: t.task_title, due: t.due_date })),
    ...deadlines.map((d) => ({ kind: "deadline" as const, id: d.id, title: d.deadline_title, due: d.due_date })),
  ]
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))
    .slice(0, 5);
  const unpaidInvoices = invoices.filter((i) => i.total_amount > i.amount_paid);
  const balance = unpaidInvoices.reduce((sum, i) => sum + (i.total_amount - i.amount_paid), 0);

  return (
    <div className="space-y-6 pb-8">
      <button onClick={() => router.push("/clients")} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">
        <ArrowLeft size={13} /> Back to Clients
      </button>

      {/* Header */}
      <div className="app-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-emerald-50 text-base font-bold text-[#108A64]">
              {clientInitials(client)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-slab text-xl font-bold text-ink break-anywhere">{displayName}</h1>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>{meta.label}</span>
                <StatusPill status={client.status} />
              </div>
              {isBusiness && primaryContactName && (
                <div className="mt-1 text-xs text-muted">
                  Primary contact: <span className="font-semibold text-ink">{primaryContactName}</span>
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {client.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} /> {client.email}
                  </span>
                )}
                {client.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={12} /> {client.phone}
                  </span>
                )}
                {team.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {team.map((t) => t.label).join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setShowClientModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0d7555]"
            >
              <Pencil size={13} /> Edit account
            </button>
            <button
              onClick={() => setShowActivateModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper"
            >
              <Plus size={13} /> Add service
            </button>
            <div className="relative">
              <button
                onClick={() => setShowHeaderMenu((v) => !v)}
                aria-label="More actions"
                className="grid h-9 w-9 place-items-center rounded-xl border border-line text-muted hover:text-ink hover:bg-paper"
              >
                <MoreHorizontal size={16} />
              </button>
              {showHeaderMenu && (
                <>
                  <button aria-hidden className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} tabIndex={-1} />
                  <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-xl">
                    <MenuItem
                      icon={ClipboardList}
                      label="Add task"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowTaskModal(true);
                      }}
                    />
                    <MenuItem
                      icon={FileText}
                      label="Request documents"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowRequestModal(true);
                      }}
                    />
                    <MenuItem icon={MessageSquare} label="Send message" disabled disabledReason="Not yet connected" />
                    <MenuItem
                      icon={UserPlus}
                      label="Invite to portal"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowInviteModal(true);
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${
              tab === t ? "border-[#108A64] text-[#108A64]" : "border-transparent text-muted"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <RequestedServicesCard
              interests={serviceInterests}
              serviceTypeLabels={serviceTypeLabels}
              services={services}
              onActivate={(interest, label) => setActivatingRequestedService({ serviceType: interest.service_type, label })}
            />

            <Card
              title="Active Services"
              action={{ label: "View All", onClick: () => setTab("work") }}
              headerAction={{ icon: Plus, label: "Add", onClick: () => setShowActivateModal(true) }}
            >
              {services.length === 0 ? (
                <EmptyAction text="No services yet." actionLabel="Add Service" onAction={() => setShowActivateModal(true)} />
              ) : (
                <div className="divide-y divide-line">
                  {services.slice(0, 4).map((s) => (
                    <ServiceRow key={s.id} s={s} engagementId={serviceEngagements.get(s.id)} onEdit={() => setEditingService(s)} />
                  ))}
                </div>
              )}
            </Card>

            <Card title="Upcoming Tasks & Deadlines" action={{ label: "View All", onClick: () => setTab("work") }}>
              {openTasksAndDeadlines.length === 0 ? (
                <Empty text="Nothing due right now." />
              ) : (
                <div className="divide-y divide-line">
                  {openTasksAndDeadlines.map((item) => (
                    <button
                      type="button"
                      key={`${item.kind}-${item.id}`}
                      onClick={() => setTab("work")}
                      className="flex w-full items-center justify-between py-2.5 text-left text-sm hover:bg-paper transition-colors"
                    >
                      <span className="min-w-0">
                        <span
                          className={`mr-2 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            item.kind === "deadline"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-blue-200 bg-blue-50 text-blue-700"
                          }`}
                        >
                          {item.kind === "deadline" ? "Deadline" : "Task"}
                        </span>
                        <span className="text-ink">{item.title}</span>
                        {item.kind === "task" && taskLabelById.get(item.id) && (
                          <span className="ml-2 rounded-full bg-paper border border-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                            {taskLabelById.get(item.id)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted tabular-nums font-mono">{item.due ?? "No due date"}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Open Document Requests" action={{ label: "View All", onClick: () => setTab("documents") }}>
              {openDocs.length === 0 ? (
                <Empty text="No open document requests." />
              ) : (
                <div className="divide-y divide-line">
                  {openDocs.slice(0, 4).map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-ink">{d.document_name}</span>
                      <StatusPill status={d.document_status} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Recent Communication" action={{ label: "View All", onClick: () => setTab("communication") }}>
              {messages.length === 0 ? (
                <Empty text="No communication logged yet." />
              ) : (
                <div className="divide-y divide-line">
                  {messages.slice(0, 3).map((m) => (
                    <MessageRow key={m.id} m={m} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Account Summary">
              <div className="space-y-3 text-sm">
                <InfoRow icon={isBusiness ? Info : Mail} label={isBusiness ? "Business email" : "Email"} value={client.email} />
                <InfoRow icon={Phone} label={isBusiness ? "Business phone" : "Phone"} value={client.phone} />
                <InfoRow icon={MapPin} label="Address" value={address} />
                <InfoRow icon={Tag} label="Source" value={client.source} />
              </div>
              {(tags.length > 0 || team.length > 0) && (
                <div className="mt-4 space-y-2.5 border-t border-line pt-3.5">
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span key={t.id} className="rounded-full bg-paper border border-line px-2 py-0.5 text-[10px] font-semibold text-ink">
                          {t.tag_name}
                        </span>
                      ))}
                    </div>
                  )}
                  {team.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <Users size={12} /> {team.map((t) => t.label).join(", ")}
                    </div>
                  )}
                </div>
              )}
            </Card>

            <ContactsCard
              client={client}
              contacts={contacts}
              openContactMenuId={openContactMenuId}
              setOpenContactMenuId={setOpenContactMenuId}
              onAdd={() => setShowAddContactModal(true)}
              onView={(link) => setViewingContact({ link, edit: false })}
              onEdit={(link) => setViewingContact({ link, edit: true })}
              onMakePrimary={makePrimary}
              onRemove={removeContact}
              onInvite={(c) => {
                setInvitingContact(c);
                setShowInviteModal(true);
              }}
              actionError={contactActionError}
            />

            <Card title="Notes & Alerts" action={{ label: "View All", onClick: () => setTab("notes") }}>
              {notes.length === 0 ? (
                <Empty text="No notes yet." />
              ) : (
                <div className="space-y-2.5">
                  {notes.slice(0, 2).map((n) => (
                    <div key={n.id} className="text-sm">
                      <div className="text-ink break-anywhere">{n.note_body}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{new Date(n.created_at).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "work" && (
        <div className="space-y-4">
          <RequestedServicesCard
            interests={serviceInterests}
            serviceTypeLabels={serviceTypeLabels}
            services={services}
            onActivate={(interest, label) => setActivatingRequestedService({ serviceType: interest.service_type, label })}
          />

          <Card title="Services" headerAction={{ icon: Plus, label: "Add service", onClick: () => setShowActivateModal(true) }}>
            {services.length === 0 ? (
              <EmptyAction text="No services yet. Add one to open its Service Workspace." actionLabel="Add Service" onAction={() => setShowActivateModal(true)} />
            ) : (
              <div className="divide-y divide-line">
                {services.map((s) => (
                  <ServiceRow key={s.id} s={s} engagementId={serviceEngagements.get(s.id)} onEdit={() => setEditingService(s)} />
                ))}
              </div>
            )}
          </Card>

          <Card title="Tasks" headerAction={{ icon: Plus, label: "Add", onClick: () => setShowTaskModal(true) }}>
            {tasks.length === 0 ? (
              <Empty text="No tasks yet." />
            ) : (
              <div className="space-y-5">
                {taskGroups.map((group) => (
                  <div key={group.key}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-ink">
                          {group.label}
                          {group.subtitle && ` — ${group.subtitle}`}
                        </span>
                        {group.statusLabel && <StatusPill status={group.statusLabel} />}
                        {group.orphaned && group.key !== "general" && (
                          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            No linked service record
                          </span>
                        )}
                        <span className="text-[11px] text-muted">
                          {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {group.engagementId && (
                        <Link href={`/work/${group.engagementId}`} className="text-xs font-semibold text-[#108A64] hover:underline">
                          Open Workspace
                        </Link>
                      )}
                    </div>
                    <div className="divide-y divide-line">
                      {group.tasks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between py-3">
                          <label className="flex min-w-0 items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={t.task_status === "Completed"}
                              onChange={() => toggleTask(t)}
                              className="h-4 w-4 shrink-0 accent-[#108A64]"
                            />
                            <span
                              className="truncate text-sm font-semibold text-ink"
                              style={{ textDecoration: t.task_status === "Completed" ? "line-through" : "none", opacity: t.task_status === "Completed" ? 0.5 : 1 }}
                            >
                              {t.task_title}
                            </span>
                          </label>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-xs tabular-nums font-mono text-muted">{t.due_date ?? "No due date"}</span>
                            <button onClick={() => setEditingTask(t)} className="text-muted hover:text-ink" aria-label="Edit task">
                              <Pencil size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Deadlines" headerAction={{ icon: Plus, label: "Add", onClick: () => setShowDeadlineModal(true) }}>
            {deadlines.length === 0 ? (
              <Empty text="No deadlines yet." />
            ) : (
              <div className="divide-y divide-line">
                {deadlines.map((d) => (
                  <button key={d.id} onClick={() => setEditingDeadline(d)} className="flex w-full items-center justify-between py-3 text-left hover:bg-paper transition-colors">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{d.deadline_title}</div>
                      <div className="mt-0.5 text-xs text-muted">{d.deadline_type}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm tabular-nums font-mono text-ink">{d.due_date}</span>
                      <StatusPill status={d.deadline_status} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="app-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 mb-4">
            <h2 className="font-bold text-ink">Documents</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setShowFolderModal(true)} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper">
                <Plus size={13} /> Folders
              </button>
              <button onClick={() => setShowRequestModal(true)} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper">
                <Plus size={13} /> Request
              </button>
              <button onClick={() => setShowUploadModal(true)} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper">
                <Upload size={13} /> Upload
              </button>
            </div>
          </div>

          {documents.length === 0 && <Empty text="No documents yet." />}

          {(() => {
            const orderedFolders = orderFoldersByTree(folders);
            return [...orderedFolders.map((o) => o.folder), null].map((folder, idx) => {
              const depth = folder ? orderedFolders[idx]?.depth ?? 0 : 0;
              const folderDocs = documents.filter((d) => (folder ? d.folder_id === folder.id : !d.folder_id));
              if (folderDocs.length === 0) return null;
              return (
                <div key={folder ? folder.id : "unfiled"} className="mb-4" style={{ marginLeft: folder ? depth * 20 : 0 }}>
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{folder ? folder.folder_name : "Unfiled"}</div>
                  <div className="divide-y divide-line rounded-xl border border-line">
                    {folderDocs.map((d) => (
                      <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-ink">{d.document_name}</div>
                          <div className="mt-0.5 text-xs text-muted">{d.document_category}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {folders.length > 0 && (
                            <select
                              value={d.folder_id ?? ""}
                              onChange={(e) => moveDocumentToFolder(d, e.target.value)}
                              className="text-xs border border-line rounded-lg px-2 py-1 text-muted"
                            >
                              <option value="">Unfiled</option>
                              {orderedFolders.map(({ folder: f, depth: fd }) => (
                                <option key={f.id} value={f.id}>
                                  {"—".repeat(fd)} {f.folder_name}
                                </option>
                              ))}
                            </select>
                          )}
                          <StatusPill status={d.document_status} />
                          {d.storage_path && (
                            <button onClick={() => downloadDocument(d)} className="text-muted hover:text-ink">
                              <Download size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {tab === "communication" && (
        <Card
          title="Communication"
          headerAction={{ icon: MessageSquare, label: "Send message", onClick: undefined, disabled: true, disabledReason: "Not yet connected" }}
        >
          {messages.length === 0 ? (
            <Empty text="No communication logged yet." />
          ) : (
            <div className="divide-y divide-line">
              {messages.map((m) => (
                <MessageRow key={m.id} m={m} expanded />
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "billing" && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Balance">
              <div className="text-2xl font-bold tabular-nums text-ink">${balance.toFixed(2)}</div>
              <div className="mt-1 text-xs text-muted">{unpaidInvoices.length} unpaid invoice{unpaidInvoices.length === 1 ? "" : "s"}</div>
            </Card>
            <Card title="Billing status">
              <div className="text-sm text-ink">{balance > 0 ? "Outstanding balance" : "Account current"}</div>
              <button
                onClick={() => setShowInvoiceModal(true)}
                className="mt-3 flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
              >
                <Plus size={13} /> Create Invoice
              </button>
            </Card>
          </div>

          <Card title="Unpaid Invoices">
            {unpaidInvoices.length === 0 ? (
              <Empty text="No unpaid invoices." />
            ) : (
              <div className="divide-y divide-line">
                {unpaidInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-ink">{inv.invoice_number || "Invoice"}</span>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums font-mono text-ink">${(inv.total_amount - inv.amount_paid).toFixed(2)}</span>
                      <StatusPill status={inv.invoice_status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Recent Payments">
            {payments.length === 0 ? (
              <Empty text="No payments recorded yet." />
            ) : (
              <div className="divide-y divide-line">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-ink">{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</span>
                    <span className="tabular-nums font-mono text-ink">${p.payment_amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "notes" && (
        <Card title="Notes">
          <div className="mb-4 flex gap-2">
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add an internal note…"
              className="flex-1 rounded-xl border border-line px-3 py-2 text-sm outline-none focus:border-[#108A64]"
              onKeyDown={(e) => {
                if (e.key === "Enter") addNote();
              }}
            />
            <button
              onClick={addNote}
              disabled={savingNote || !newNote.trim()}
              className="rounded-xl bg-[#108A64] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {savingNote ? "Saving…" : "Add Note"}
            </button>
          </div>
          {notes.length === 0 ? (
            <Empty text="No notes yet." />
          ) : (
            <div className="divide-y divide-line">
              {notes.map((n) => (
                <div key={n.id} className="py-2.5 text-sm">
                  <div className="text-ink break-anywhere">{n.note_body}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "details" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={isBusiness ? "Business Details" : "Personal Details"}>
            <div className="space-y-3 text-sm">
              {isBusiness ? (
                <>
                  <InfoRow icon={Info} label="Legal / business name" value={client.business_name} />
                  <InfoRow icon={Mail} label="Business email" value={client.email} />
                  <InfoRow icon={Phone} label="Business phone" value={client.phone} />
                </>
              ) : (
                <>
                  <InfoRow icon={Info} label="First name" value={client.first_name} />
                  <InfoRow icon={Info} label="Middle name" value={client.middle_name} />
                  <InfoRow icon={Info} label="Last name" value={client.last_name} />
                  <InfoRow icon={Mail} label="Personal email" value={client.email} />
                  <InfoRow icon={Phone} label="Personal phone" value={client.phone} />
                  <InfoRow icon={Info} label="Occupation" value={client.occupation} />
                </>
              )}
              <InfoRow icon={MapPin} label="Address" value={address} />
              <InfoRow icon={Tag} label="Source" value={client.source} />
              <InfoRow icon={Info} label="Status" value={client.status} />
            </div>
            {(tags.length > 0 || team.length > 0) && (
              <div className="mt-4 space-y-2.5 border-t border-line pt-3.5">
                {tags.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Tags</div>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <span key={t.id} className="rounded-full bg-paper border border-line px-2 py-0.5 text-[10px] font-semibold text-ink">
                          {t.tag_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {team.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Assigned team</div>
                    <div className="text-sm text-ink">{team.map((t) => t.label).join(", ")}</div>
                  </div>
                )}
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Portal status</div>
                  <div className="text-sm text-ink">
                    {contacts.filter((c) => c.portal_access).length} of {contacts.length || 0} linked contact
                    {contacts.length === 1 ? "" : "s"} have portal access
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card title={isBusiness ? "Business Tax / Identity" : "Tax / Identity"}>
            {isBusiness ? (
              maskedIdentity ? (
                <div className="space-y-3 text-sm">
                  <InfoRow icon={ShieldCheck} label="EIN" value={maskedIdentity.masked_value} />
                  <button onClick={() => setShowClientModal(true)} className="text-xs font-semibold text-[#108A64] hover:underline">
                    Reveal or replace in Edit account
                  </button>
                </div>
              ) : (
                <Empty text="Business identity details not entered." />
              )
            ) : (
              <div className="space-y-3 text-sm">
                <InfoRow icon={Cake} label="Date of birth" value={client.date_of_birth} />
                <InfoRow icon={ShieldCheck} label="SSN" value={maskedIdentity?.masked_value || (client.ssn_last_four ? `•••-••-${client.ssn_last_four}` : null)} />
                {maskedIdentity && (
                  <button onClick={() => setShowClientModal(true)} className="text-xs font-semibold text-[#108A64] hover:underline">
                    Reveal or replace in Edit account
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {showClientModal && <ClientModal client={client} onClose={() => setShowClientModal(false)} onSaved={refresh} onDeleted={() => router.push("/clients")} />}
      {showAddContactModal && (
        // NOTE: this used to jump ClientModal straight to a "link an
        // existing contact" step (initialStep/initialContactMode props),
        // which was removed along with the rest of the contacts/
        // account_contacts linking flow -- neither table exists live. This
        // whole Contacts card (below) still reads from account_contacts
        // and is independently broken; flagged, not fixed, in this pass.
        <ClientModal client={client} onClose={() => setShowAddContactModal(false)} onSaved={refresh} />
      )}
      {viewingContact && viewingContact.link.contacts && (
        <ContactDetailModal
          contact={viewingContact.link.contacts}
          linkId={viewingContact.link.id}
          isPrimary={viewingContact.link.is_primary}
          relationshipType={viewingContact.link.relationship_type}
          portalAccess={viewingContact.link.portal_access}
          contactTypeLabel={contactRoleLabel(client.client_type, viewingContact.link.is_primary)}
          accountName={displayName}
          onClose={() => setViewingContact(null)}
          onSaved={() => {
            setViewingContact(null);
            load();
          }}
        />
      )}
      {showInviteModal && (
        <InvitePortalModal
          workspaceId={client.workspace_id}
          clientId={client.id}
          defaultEmail={invitingContact?.personal_email ?? client.email}
          onClose={() => {
            setShowInviteModal(false);
            setInvitingContact(null);
          }}
        />
      )}
      {showUploadModal && <UploadDocumentModal clientId={client.id} workspaceId={client.workspace_id} onClose={() => setShowUploadModal(false)} onSaved={refresh} />}
      {showRequestModal && <RequestDocumentModal clientId={client.id} onClose={() => setShowRequestModal(false)} onSaved={refresh} />}
      {showFolderModal && <DocumentFolderModal clientId={client.id} workspaceId={client.workspace_id} onClose={() => setShowFolderModal(false)} onSaved={refresh} />}
      {showTaskModal && <NewTaskModal clientId={client.id} onClose={() => setShowTaskModal(false)} onSaved={refresh} />}
      {editingTask && <NewTaskModal clientId={client.id} task={editingTask} onClose={() => setEditingTask(null)} onSaved={refresh} onDeleted={refresh} />}
      {showDeadlineModal && <NewDeadlineModal clientId={client.id} onClose={() => setShowDeadlineModal(false)} onSaved={refresh} />}
      {editingDeadline && (
        <NewDeadlineModal clientId={client.id} deadline={editingDeadline} onClose={() => setEditingDeadline(null)} onSaved={refresh} onDeleted={refresh} />
      )}
      {(showActivateModal || activatingRequestedService) && (
        <ActivateServiceModal
          clientId={client.id}
          workspaceId={client.workspace_id}
          initialServiceType={activatingRequestedService?.serviceType}
          requestedServiceLabel={activatingRequestedService?.label}
          remainingRequestedServices={remainingRequestedServices}
          onClose={() => {
            setShowActivateModal(false);
            setActivatingRequestedService(null);
          }}
          onActivated={handleServiceActivated}
        />
      )}
      {editingService && (
        <NewServiceModal clientId={client.id} service={editingService} onClose={() => setEditingService(null)} onSaved={refresh} onDeleted={refresh} />
      )}
      {showInvoiceModal && <NewInvoiceModal clientId={client.id} onClose={() => setShowInvoiceModal(false)} onSaved={refresh} />}
      <ConfirmDialog
        open={!!removeContactTarget}
        title={`Remove ${[removeContactTarget?.contacts?.first_name, removeContactTarget?.contacts?.last_name].filter(Boolean).join(" ") || "this contact"} from this account?`}
        description="This only removes the relationship — the contact record itself is kept."
        confirmLabel="Remove"
        busy={removingContact}
        onConfirm={confirmRemoveContact}
        onCancel={() => setRemoveContactTarget(null)}
      />
    </div>
  );
}

// "Activated" is derived, never stored: a requested service_type counts as
// activated the moment a real `services` row shares that service_type for
// this client. client_service_interests.service_status is not used for
// this — save_workspace_client resets it to 'interested' on every resave,
// and apply_service_template_to_client never updates it, so it can't be
// trusted to reflect real activation state.
function RequestedServicesCard({
  interests,
  serviceTypeLabels,
  services,
  onActivate,
}: {
  interests: ClientServiceInterest[];
  serviceTypeLabels: Map<string, string>;
  services: Service[];
  onActivate: (interest: ClientServiceInterest, label: string) => void;
}) {
  return (
    <Card title="Requested Services">
      {interests.length === 0 ? (
        <Empty text="No requested services." />
      ) : (
        <div className="divide-y divide-line">
          {interests.map((interest) => {
            const label = serviceTypeLabels.get(interest.service_type) || interest.service_type;
            const activated = services.some((s) => s.service_type === interest.service_type);
            return (
              <div key={interest.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-ink">{label}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {activated ? (
                    <StatusPill status="Activated" />
                  ) : (
                    <>
                      <StatusPill status="Not activated" />
                      <button
                        onClick={() => onActivate(interest, label)}
                        className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink hover:bg-paper"
                      >
                        Activate
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ServiceRow({ s, engagementId, onEdit }: { s: Service; engagementId?: string; onEdit: () => void }) {
  // service_year is a real column, but plenty of rows (legacy, or activated
  // before this fix) never had it set — fall back to start/due date instead
  // of a bare "No year set", and only say that when there's truly no date
  // data of any kind to show.
  const dateBits: string[] = [];
  if (s.service_year) dateBits.push(s.service_year);
  if (s.start_date) dateBits.push(`Start ${s.start_date}`);
  if (s.due_date) dateBits.push(`Due ${s.due_date}`);
  const subtitle = dateBits.length > 0 ? dateBits.join(" · ") : "No dates set";

  const mainContent = (
    <>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{s.service_type}</div>
        <div className="mt-0.5 text-xs text-muted">{subtitle}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isOpenServiceStatus(s.service_status) ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#108A64]">Active</span>
        ) : (
          <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">Closed</span>
        )}
        {/* No fabricated "Add Workflow" action here — no existing RPC
            attaches an engagement to an already-created service, so this
            only ever states the truthful current state. */}
        {!engagementId && (
          <span className="rounded-full bg-paper border border-line px-2 py-0.5 text-[10px] font-semibold text-muted">Workflow not added</span>
        )}
        <StatusPill status={s.service_status} />
      </div>
    </>
  );
  // The Edit button is always rendered (never hover-only) so it's reachable
  // on mobile — it used to only exist when a service had no engagement,
  // meaning newly-activated services (which always get one) had no way to
  // edit their dates/status/owner at all from this card.
  return (
    <div className="flex w-full items-center gap-1 py-3">
      {engagementId ? (
        <Link
          href={`/work/${engagementId}`}
          className="-mx-1 flex min-w-0 flex-1 items-center justify-between rounded-lg px-1 text-left transition-colors hover:bg-paper"
        >
          {mainContent}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-between">{mainContent}</div>
      )}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${s.service_type}`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-paper hover:text-ink"
      >
        <Pencil size={14} />
      </button>
    </div>
  );
}

function MessageRow({ m, expanded }: { m: CommMessage; expanded?: boolean }) {
  return (
    <div className="py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink capitalize">
          {m.channel} · {m.direction}
        </span>
        <span className="shrink-0 text-[11px] text-muted">{m.sent_at ? new Date(m.sent_at).toLocaleDateString() : new Date(m.created_at).toLocaleDateString()}</span>
      </div>
      {m.subject && <div className="mt-0.5 text-xs text-ink">{m.subject}</div>}
      {expanded && m.body && <div className="mt-1 text-xs text-muted break-anywhere">{m.body}</div>}
      <div className="mt-1 text-[11px] text-muted">{m.message_status}</div>
    </div>
  );
}

function ContactsCard({
  client,
  contacts,
  openContactMenuId,
  setOpenContactMenuId,
  onAdd,
  onView,
  onEdit,
  onMakePrimary,
  onRemove,
  onInvite,
  actionError,
}: {
  client: Client;
  contacts: LinkedContact[];
  openContactMenuId: string | null;
  setOpenContactMenuId: (id: string | null) => void;
  onAdd: () => void;
  onView: (link: LinkedContact) => void;
  onEdit: (link: LinkedContact) => void;
  onMakePrimary: (link: LinkedContact) => void;
  onRemove: (link: LinkedContact) => void;
  onInvite: (contact: ContactWithLinks) => void;
  actionError: string | null;
}) {
  return (
    <Card title="Contacts" headerAction={{ icon: Plus, label: "Add Contact", onClick: onAdd }}>
      {actionError && <div className="mb-3 rounded-lg bg-brick/10 border border-brick/30 px-3 py-2 text-xs text-brick">{actionError}</div>}
      {contacts.length === 0 ? (
        <EmptyAction text="No contacts linked yet." actionLabel="Add Contact" onAction={onAdd} />
      ) : (
        <div className="divide-y divide-line">
          {contacts.map((link) => {
            const c = link.contacts;
            if (!c) return null;
            const fullName = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");
            const linkedIndividual = isAlsoIndividualClient(c);
            return (
              <div key={link.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button type="button" onClick={() => onView(link)} className="text-left text-sm font-semibold text-[#108A64] hover:underline">
                      {fullName || "Unnamed contact"}
                    </button>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 ${
                          link.is_primary ? "bg-emerald-50 text-[#108A64]" : "bg-paper border border-line text-muted"
                        }`}
                      >
                        {link.is_primary && <Star size={10} />} {contactRoleLabel(client.client_type, link.is_primary)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-0.5 ${
                          link.portal_access ? "bg-emerald-50 text-[#108A64]" : "bg-paper border border-line text-muted"
                        }`}
                      >
                        <ShieldCheck size={10} /> {link.portal_access ? "Portal" : "No portal"}
                      </span>
                      {linkedIndividual && (
                        <Link
                          href={`/clients/${linkedIndividual.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-sky-50 text-sky-700 text-[10px] font-semibold px-2 py-0.5"
                        >
                          <Link2 size={10} /> Also an Individual Client
                        </Link>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                      {c.personal_email && (
                        <span className="flex items-center gap-1">
                          <Mail size={11} /> {c.personal_email}
                        </span>
                      )}
                      {c.personal_phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={11} /> {c.personal_phone}
                        </span>
                      )}
                      {c.occupation && <span>{c.occupation}</span>}
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setOpenContactMenuId(openContactMenuId === link.id ? null : link.id)}
                      aria-label="Contact actions"
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-ink hover:bg-paper"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {openContactMenuId === link.id && (
                      <>
                        <button aria-hidden className="fixed inset-0 z-40" onClick={() => setOpenContactMenuId(null)} tabIndex={-1} />
                        <div className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-xl">
                          <MenuItem
                            icon={Eye}
                            label="View contact"
                            onClick={() => {
                              setOpenContactMenuId(null);
                              onView(link);
                            }}
                          />
                          <MenuItem
                            icon={Pencil}
                            label="Edit contact"
                            onClick={() => {
                              setOpenContactMenuId(null);
                              onEdit(link);
                            }}
                          />
                          {!link.is_primary && (
                            <MenuItem
                              icon={Star}
                              label="Make primary"
                              onClick={() => {
                                setOpenContactMenuId(null);
                                onMakePrimary(link);
                              }}
                            />
                          )}
                          <MenuItem
                            icon={UserPlus}
                            label="Invite to portal"
                            onClick={() => {
                              setOpenContactMenuId(null);
                              onInvite(c);
                            }}
                          />
                          {!link.is_primary && (
                            <MenuItem
                              icon={Trash2}
                              label="Remove from business"
                              danger
                              onClick={() => {
                                setOpenContactMenuId(null);
                                onRemove(link);
                              }}
                            />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  disabledReason,
}: {
  icon: any;
  label: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm ${
        disabled ? "text-line cursor-not-allowed" : danger ? "text-brick hover:bg-brick/5" : "text-ink hover:bg-paper"
      }`}
    >
      <Icon size={14} /> {label}
      {disabled && disabledReason && <span className="ml-auto text-[10px] text-muted">{disabledReason}</span>}
    </button>
  );
}

function Card({
  title,
  action,
  headerAction,
  children,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
  headerAction?: { icon: any; label: string; onClick?: () => void; disabled?: boolean; disabledReason?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="app-card p-5">
      <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
        <h2 className="font-bold text-ink">{title}</h2>
        <div className="flex items-center gap-2">
          {headerAction && (
            <button
              onClick={headerAction.disabled ? undefined : headerAction.onClick}
              disabled={headerAction.disabled}
              title={headerAction.disabled ? headerAction.disabledReason : undefined}
              className={`flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold ${
                headerAction.disabled ? "text-line cursor-not-allowed" : "text-ink hover:bg-paper"
              }`}
            >
              <headerAction.icon size={13} /> {headerAction.label}
            </button>
          )}
          {action && (
            <button onClick={action.onClick} className="text-xs font-semibold text-[#108A64] hover:underline">
              {action.label}
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</div>
        <div className="text-sm text-ink break-anywhere">{value || "—"}</div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">{text}</div>;
}

function EmptyAction({ text, actionLabel, onAction }: { text: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
      <div className="mb-2.5">{text}</div>
      <button onClick={onAction} className="inline-flex items-center gap-1.5 rounded-xl bg-[#108A64] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0d7555]">
        <Plus size={13} /> {actionLabel}
      </button>
    </div>
  );
}
