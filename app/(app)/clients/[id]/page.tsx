"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, User, ArrowLeft, Plus, Pencil, UserPlus, Upload, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client, Service, Task, Deadline, Document, DocumentFolder } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import NewTaskModal from "@/components/NewTaskModal";
import NewDeadlineModal from "@/components/NewDeadlineModal";
import NewServiceModal from "@/components/NewServiceModal";
import ClientModal from "@/components/ClientModal";
import InvitePortalModal from "@/components/InvitePortalModal";
import UploadDocumentModal from "@/components/UploadDocumentModal";
import RequestDocumentModal from "@/components/RequestDocumentModal";
import DocumentFolderModal from "@/components/DocumentFolderModal";

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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showClientModal, setShowClientModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showDeadlineModal, setShowDeadlineModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingDeadline, setEditingDeadline] = useState<Deadline | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);

  async function load() {
    setLoading(true);
    const [clientRes, servicesRes, tasksRes, deadlinesRes, documentsRes, foldersRes] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("services").select("*").eq("client_id", id),
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
      .from("firmflow-client-documents")
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
      <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3">
        {error ?? "Client not found."}
      </div>
    );
  }

  const displayName =
    client.client_type === "business" && client.business_name
      ? client.business_name
      : `${client.first_name} ${client.last_name}`.trim();

  return (
    <div>
      <button
        onClick={() => router.push("/clients")}
        className="flex items-center gap-1.5 text-xs text-muted mb-4 hover:text-ink"
      >
        <ArrowLeft size={13} /> Back to Clients
      </button>

      <div className="flex items-center gap-3 mb-6">
        {client.client_type === "business" ? (
          <Building2 size={20} className="text-muted" />
        ) : (
          <User size={20} className="text-muted" />
        )}
        <h1 className="font-slab text-2xl font-bold text-ink">{displayName}</h1>
        <StatusPill status={client.status} />
        <button
          onClick={() => setShowInviteModal(true)}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
        >
          <UserPlus size={13} /> Invite to Portal
        </button>
        <button
          onClick={() => setShowClientModal(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
        >
          <Pencil size={13} /> Edit
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Email
          </div>
          <div className="text-sm text-ink">{client.email || "—"}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Phone
          </div>
          <div className="text-sm text-ink">{client.phone || "—"}</div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Source
          </div>
          <div className="text-sm text-ink">{client.source || "—"}</div>
        </div>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Services</h2>
          <button
            onClick={() => setShowServiceModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {services.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No services yet.</div>
          )}
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => setEditingService(s)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">{s.service_type}</div>
                <div className="text-xs text-muted mt-0.5">{s.service_year}</div>
              </div>
              <StatusPill status={s.service_status} />
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Tasks</h2>
          <button
            onClick={() => setShowTaskModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {tasks.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No tasks yet.</div>
          )}
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={t.task_status === "Done"}
                  onChange={() => toggleTask(t)}
                  className="w-4 h-4 accent-[#0D1B2A]"
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
      </section>

      <section>
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Deadlines</h2>
          <button
            onClick={() => setShowDeadlineModal(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
          {deadlines.length === 0 && (
            <div className="px-5 py-5 text-sm text-muted">No deadlines yet.</div>
          )}
          {deadlines.map((d) => (
            <button
              key={d.id}
              onClick={() => setEditingDeadline(d)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-paper transition-colors"
            >
              <div>
                <div className="font-semibold text-ink text-sm">{d.deadline_title}</div>
                <div className="text-xs text-muted mt-0.5">{d.deadline_type}</div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm tabular-nums font-mono text-ink">
                  {d.due_date}
                </span>
                <StatusPill status={d.deadline_status} />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h2 className="font-slab text-lg font-bold text-ink">Documents</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFolderModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
            >
              <Plus size={13} /> Folders
            </button>
            <button
              onClick={() => setShowRequestModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
            >
              <Plus size={13} /> Request
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
            >
              <Upload size={13} /> Upload
            </button>
          </div>
        </div>

        {documents.length === 0 && (
          <div className="bg-white border border-line rounded-sm px-5 py-5 text-sm text-muted">
            No documents yet.
          </div>
        )}

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
                <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
                  {folderDocs.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
                      <div>
                        <div className="font-semibold text-ink text-sm">{d.document_name}</div>
                        <div className="text-xs text-muted mt-0.5">{d.document_category}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {folders.length > 0 && (
                          <select
                            value={d.folder_id ?? ""}
                            onChange={(e) => moveDocumentToFolder(d, e.target.value)}
                            className="text-xs border border-line rounded-sm px-2 py-1 text-muted"
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
                          <button
                            onClick={() => downloadDocument(d)}
                            className="text-muted hover:text-ink"
                          >
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
      </section>

      {showClientModal && (
        <ClientModal
          client={client}
          onClose={() => setShowClientModal(false)}
          onSaved={load}
          onDeleted={() => router.push("/clients")}
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
        <NewTaskModal
          clientId={client.id}
          onClose={() => setShowTaskModal(false)}
          onSaved={load}
        />
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
        <NewDeadlineModal
          clientId={client.id}
          onClose={() => setShowDeadlineModal(false)}
          onSaved={load}
        />
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
      {showServiceModal && (
        <NewServiceModal
          clientId={client.id}
          onClose={() => setShowServiceModal(false)}
          onSaved={load}
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
