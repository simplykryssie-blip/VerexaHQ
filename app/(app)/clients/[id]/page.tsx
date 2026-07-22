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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client, Contact, Service, Task, Deadline, Document, DocumentFolder } from "@/lib/types";
import { clientDisplayName, clientInitials, accountTypeMeta } from "@/lib/clientDisplay";
import { isOpenServiceStatus } from "@/lib/status";
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

type LinkedContact = {
  id: string;
  contact_id: string;
  relationship_type: string | null;
  is_primary: boolean;
  portal_access: boolean;
  contacts: Contact | null;
};

const TABS = ["overview", "tasks", "deadlines", "documents"] as const;
type Tab = (typeof TABS)[number];

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
  const [contacts, setContacts] = useState<LinkedContact[]>([]);
  const [viewingContact, setViewingContact] = useState<LinkedContact | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");

  const [showClientModal, setShowClientModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);

  async function load() {
    setLoading(true);
    const [clientRes, servicesRes, engagementsRes, contactsRes, tasksRes, deadlinesRes, documentsRes, foldersRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("services").select("*").eq("client_id", id),
      supabase.from("engagements").select("id, service_id").eq("account_id", id),
      supabase
        .from("account_contacts")
        .select("id, contact_id, relationship_type, is_primary, portal_access, contacts(*)")
        .eq("account_id", id)
        .order("is_primary", { ascending: false }),
      supabase.from("tasks").select("*").eq("client_id", id).order("due_date"),
      supabase.from("deadlines").select("*").eq("client_id", id).order("due_date"),
      supabase.from("documents").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("document_folders").select("*").eq("client_id", id).order("sort_order"),
    ]);

    if (clientRes.error) {
      setError(clientRes.error.message);
      setLoading(false);
      return;
    }

    setClient(clientRes.data as Client);
    setServices((servicesRes.data as Service[]) ?? []);
    const engMap = new Map<string, string>();
    (engagementsRes.data ?? []).forEach((e: any) => {
      if (e.service_id) engMap.set(e.service_id, e.id);
    });
    setServiceEngagements(engMap);
    setContacts((contactsRes.data as unknown as LinkedContact[]) ?? []);
    setTasks((tasksRes.data as Task[]) ?? []);
    setDeadlines((deadlinesRes.data as Deadline[]) ?? []);
    setDocuments((documentsRes.data as Document[]) ?? []);
    setFolders((foldersRes.data as DocumentFolder[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function toggleTask(task: Task) {
    const nextStatus = task.task_status === "Done" ? "To Do" : "Done";
    const { error } = await supabase
      .from("tasks")
      .update({
        task_status: nextStatus,
        completed_at: nextStatus === "Done" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (!error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, task_status: nextStatus } : t))
      );
    }
  }

  async function downloadDocument(doc: Document) {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage
      .from("verexahq-client-documents")
      .createSignedUrl(doc.storage_path, 60);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  async function moveDocumentToFolder(doc: Document, folderId: string) {
    const { error } = await supabase
      .from("documents")
      .update({ folder_id: folderId || null })
      .eq("id", doc.id);
    if (!error) {
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, folder_id: folderId || null } : d))
      );
    }
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

  const displayName = clientDisplayName(client);
  const meta = accountTypeMeta(client.account_type);
  const address = [client.address, [client.city, client.state, client.zip_code].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/clients")}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Clients
      </button>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-emerald-50 text-base font-bold text-[#108A64]">
            {clientInitials(client)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-slab text-xl font-bold text-ink">{displayName}</h1>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.badge}`}>{meta.label}</span>
              <StatusPill status={client.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {client.email && <span className="flex items-center gap-1"><Mail size={12} /> {client.email}</span>}
              {client.phone && <span className="flex items-center gap-1"><Phone size={12} /> {client.phone}</span>}
              {client.source && <span className="flex items-center gap-1"><Tag size={12} /> {client.source}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper"
            >
              <UserPlus size={13} /> Invite to Portal
            </button>
            <button
              onClick={() => setShowClientModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper"
            >
              <Pencil size={13} /> Edit
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold capitalize ${
              tab === t ? "border-[#108A64] text-[#108A64]" : "border-transparent text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="app-card p-5">
            <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
              <h2 className="font-bold text-ink">Services</h2>
              <button
                onClick={() => setShowActivateModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
              >
                <Plus size={13} /> Add service
              </button>
            </div>
            <div className="divide-y divide-line">
              {services.length === 0 && <Empty text="No services yet. Add one to open its Service Workspace." />}
              {services.map((s) => {
                const engagementId = serviceEngagements.get(s.id);
                const content = (
                  <>
                    <div>
                      <div className="font-semibold text-ink text-sm">{s.service_type}</div>
                      <div className="text-xs text-muted mt-0.5">
                        {s.service_year || "No year set"}
                        {!engagementId && " · Legacy service, no workspace"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOpenServiceStatus(s.service_status) ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#108A64]">Active</span>
                      ) : (
                        <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-semibold text-muted">Closed</span>
                      )}
                      <StatusPill status={s.service_status} />
                    </div>
                  </>
                );
                return engagementId ? (
                  <Link
                    key={s.id}
                    href={`/work/${engagementId}`}
                    className="w-full flex items-center justify-between py-3.5 text-left hover:bg-paper transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={s.id}
                    onClick={() => setEditingService(s)}
                    className="w-full flex items-center justify-between py-3.5 text-left hover:bg-paper transition-colors"
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="app-card p-5">
            <h2 className="font-bold text-ink">Contacts</h2>
            <div className="mt-4 divide-y divide-line">
              {contacts.length === 0 && <Empty text="No contacts linked yet." />}
              {contacts.map((link) => {
                const c = link.contacts;
                if (!c) return null;
                const fullName = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");
                return (
                  <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 py-3.5">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setViewingContact(link)}
                        className="font-semibold text-sm text-[#108A64] hover:underline text-left"
                      >
                        {fullName || "Unnamed contact"}
                      </button>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        {c.personal_email && <span className="flex items-center gap-1"><Mail size={12} /> {c.personal_email}</span>}
                        {c.personal_phone && <span className="flex items-center gap-1"><Phone size={12} /> {c.personal_phone}</span>}
                        {c.occupation && <span>{c.occupation}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {link.is_primary && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-[#108A64] text-[10px] font-semibold px-2 py-1">
                          <Star size={11} /> Primary
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full text-[10px] font-semibold px-2 py-1 ${
                          link.portal_access ? "bg-emerald-50 text-[#108A64]" : "bg-paper border border-line text-muted"
                        }`}
                      >
                        <ShieldCheck size={11} /> {link.portal_access ? "Portal access" : "No portal access"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="app-card p-5">
              <h2 className="font-bold text-ink">Contact</h2>
              <div className="mt-4 space-y-3 text-sm">
                <InfoRow icon={Mail} label="Email" value={client.email} />
                <InfoRow icon={Phone} label="Phone" value={client.phone} />
                <InfoRow icon={MapPin} label="Address" value={address} />
                <InfoRow icon={Tag} label="Source" value={client.source} />
              </div>
            </div>
            <div className="app-card p-5">
              <h2 className="font-bold text-ink">Tax profile</h2>
              <div className="mt-4 space-y-3 text-sm">
                <InfoRow icon={Cake} label="Date of birth" value={client.date_of_birth} />
                <InfoRow
                  icon={ShieldCheck}
                  label="SSN"
                  value={client.ssn_last_four ? `•••-••-${client.ssn_last_four}` : ""}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "tasks" && (
        <div className="app-card p-5">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <h2 className="font-bold text-ink">Tasks</h2>
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
            >
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="divide-y divide-line">
            {tasks.length === 0 && <Empty text="No tasks yet." />}
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={t.task_status === "Done"}
                    onChange={() => toggleTask(t)}
                    className="w-4 h-4 accent-[#108A64]"
                  />
                  <span
                    className="text-sm font-semibold text-ink"
                    style={{
                      textDecoration: t.task_status === "Done" ? "line-through" : "none",
                      opacity: t.task_status === "Done" ? 0.5 : 1,
                    }}
                  >
                    {t.task_title}
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular-nums font-mono text-muted">
                    {t.due_date ?? "No due date"}
                  </span>
                  <button
                    onClick={() => setEditingTask(t)}
                    className="text-muted hover:text-ink"
                    aria-label="Edit task"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "deadlines" && (
        <div className="app-card p-5">
          <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
            <h2 className="font-bold text-ink">Deadlines</h2>
            <button
              onClick={() => setShowDeadlineModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
            >
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="divide-y divide-line">
            {deadlines.length === 0 && <Empty text="No deadlines yet." />}
            {deadlines.map((d) => (
              <button
                key={d.id}
                onClick={() => setEditingDeadline(d)}
                className="w-full flex items-center justify-between py-3.5 text-left hover:bg-paper transition-colors"
              >
                <div>
                  <div className="font-semibold text-ink text-sm">{d.deadline_title}</div>
                  <div className="text-xs text-muted mt-0.5">{d.deadline_type}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm tabular-nums font-mono text-ink">{d.due_date}</span>
                  <StatusPill status={d.deadline_status} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="app-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 mb-4">
            <h2 className="font-bold text-ink">Documents</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFolderModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
              >
                <Plus size={13} /> Folders
              </button>
              <button
                onClick={() => setShowRequestModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
              >
                <Plus size={13} /> Request
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper"
              >
                <Upload size={13} /> Upload
              </button>
            </div>
          </div>

          {documents.length === 0 && <Empty text="No documents yet." />}

          {(() => {
            const orderedFolders = orderFoldersByTree(folders);
            return [...orderedFolders.map((o) => o.folder), null].map((folder, idx) => {
              const depth = folder ? orderedFolders[idx]?.depth ?? 0 : 0;
              const folderDocs = documents.filter((d) =>
                folder ? d.folder_id === folder.id : !d.folder_id
              );
              if (folderDocs.length === 0) return null;
              return (
                <div
                  key={folder ? folder.id : "unfiled"}
                  className="mb-4"
                  style={{ marginLeft: folder ? depth * 20 : 0 }}
                >
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                    {folder ? folder.folder_name : "Unfiled"}
                  </div>
                  <div className="divide-y divide-line rounded-xl border border-line">
                    {folderDocs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-4 py-3.5">
                        <div>
                          <div className="font-semibold text-ink text-sm">{d.document_name}</div>
                          <div className="text-xs text-muted mt-0.5">{d.document_category}</div>
                        </div>
                        <div className="flex items-center gap-3">
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

      {showClientModal && (
        <ClientModal
          client={client}
          onClose={() => setShowClientModal(false)}
          onSaved={load}
          onDeleted={() => router.push("/clients")}
        />
      )}
      {viewingContact && viewingContact.contacts && (
        <ContactDetailModal
          contact={viewingContact.contacts}
          isPrimary={viewingContact.is_primary}
          relationshipType={viewingContact.relationship_type}
          portalAccess={viewingContact.portal_access}
          onClose={() => setViewingContact(null)}
        />
      )}
      {showInviteModal && (
        <InvitePortalModal
          workspaceId={client.workspace_id}
          clientId={client.id}
          defaultEmail={client.email}
          onClose={() => setShowInviteModal(false)}
        />
      )}
      {showUploadModal && (
        <UploadDocumentModal
          clientId={client.id}
          workspaceId={client.workspace_id}
          onClose={() => setShowUploadModal(false)}
          onSaved={load}
        />
      )}
      {showRequestModal && (
        <RequestDocumentModal
          clientId={client.id}
          onClose={() => setShowRequestModal(false)}
          onSaved={load}
        />
      )}
      {showFolderModal && (
        <DocumentFolderModal
          clientId={client.id}
          workspaceId={client.workspace_id}
          onClose={() => setShowFolderModal(false)}
          onSaved={load}
        />
      )}
      {showTaskModal && (
        <NewTaskModal clientId={client.id} onClose={() => setShowTaskModal(false)} onSaved={load} />
      )}
      {editingTask && (
        <NewTaskModal
          clientId={client.id}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
      {showDeadlineModal && (
        <NewDeadlineModal clientId={client.id} onClose={() => setShowDeadlineModal(false)} onSaved={load} />
      )}
      {editingDeadline && (
        <NewDeadlineModal
          clientId={client.id}
          deadline={editingDeadline}
          onClose={() => setEditingDeadline(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
      {showActivateModal && (
        <ActivateServiceModal
          clientId={client.id}
          workspaceId={client.workspace_id}
          onClose={() => setShowActivateModal(false)}
          onActivated={load}
        />
      )}
      {editingService && (
        <NewServiceModal
          clientId={client.id}
          service={editingService}
          onClose={() => setEditingService(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted"><Icon size={14} /></div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</div>
        <div className="text-sm text-ink break-anywhere">{value || "—"}</div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">{text}</div>;
}
