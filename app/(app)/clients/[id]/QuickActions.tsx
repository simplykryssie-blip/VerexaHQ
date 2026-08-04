"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Upload, FileText, Receipt, StickyNote, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

type Props = { clientId: string; workspaceId: string; documentRequestTemplates: { id: string; name: string }[] };

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
    >
      <Icon size={14} /> {label}
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function QuickActions({ clientId, workspaceId, documentRequestTemplates }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [modal, setModal] = useState<
    "message" | "upload" | "request" | "invoice" | "quote" | "note" | null
  >(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = `${workspaceId}/${clientId}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, file);
    if (uploadErr) {
      setUploading(false);
      setUploadError(uploadErr.message);
      return;
    }

    const { error: insertErr } = await supabase.from("attachments").insert({
      workspace_id: workspaceId,
      entity_type: "client",
      entity_id: clientId,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      uploaded_by: user?.id,
    });

    setUploading(false);
    if (insertErr) {
      setUploadError(insertErr.message);
      return;
    }

    setFile(null);
    setModal(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/engagements/new?clientId=${clientId}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
        >
          <Plus size={14} /> New Engagement
        </Link>
        <ActionButton icon={MessageSquare} label="Send Message" onClick={() => setModal("message")} />
        <ActionButton icon={Upload} label="Upload Document" onClick={() => setModal("upload")} />
        <ActionButton icon={ClipboardList} label="Request Documents" onClick={() => setModal("request")} />
        <ActionButton icon={Receipt} label="Create Invoice" onClick={() => setModal("invoice")} />
        <ActionButton icon={FileText} label="Create Quote" onClick={() => setModal("quote")} />
        <ActionButton icon={StickyNote} label="Add Note" onClick={() => setModal("note")} />
      </div>

      {modal === "message" && (
        <Modal title="Send message" onClose={() => setModal(null)}>
          <InlineAddForm
            label="Send"
            fields={[
              {
                name: "channel",
                label: "Channel",
                type: "select",
                required: true,
                options: [
                  { value: "portal", label: "Client portal" },
                  { value: "email", label: "Email" },
                  { value: "sms", label: "SMS" },
                  { value: "internal", label: "Internal note" },
                ],
              },
              { name: "body", label: "Message", required: true },
            ]}
            onSubmit={async (v) => {
              const isInternal = v.channel === "internal";
              const {
                data: { user },
              } = await supabase.auth.getUser();
              const { data: thread, error: threadError } = await supabase
                .from("message_threads")
                .insert({
                  workspace_id: workspaceId,
                  entity_type: "client",
                  entity_id: clientId,
                  channel: isInternal ? "internal" : v.channel,
                  subject: isInternal ? "Internal note" : "Message",
                  created_by: user?.id,
                })
                .select("id")
                .single();
              if (threadError || !thread) return threadError?.message ?? "Could not create thread.";
              const { error } = await supabase.from("messages").insert({
                workspace_id: workspaceId,
                thread_id: thread.id,
                sender_type: "staff",
                sender_id: user?.id,
                body: v.body,
                is_internal: isInternal,
              });
              if (error) return error.message;
              setModal(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {modal === "upload" && (
        <Modal title="Upload document" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
            {uploadError && <p className="text-sm text-danger">{uploadError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!file || uploading}
                onClick={handleUpload}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === "request" && (
        <Modal title="Request documents" onClose={() => setModal(null)}>
          {documentRequestTemplates.length === 0 ? (
            <p className="text-sm text-muted">
              No document request templates are set up yet -- add one in Settings first.
            </p>
          ) : (
            <InlineAddForm
              label="Send request"
              fields={[
                {
                  name: "template_id",
                  label: "Document set",
                  type: "select",
                  required: true,
                  options: documentRequestTemplates.map((t) => ({ value: t.id, label: t.name })),
                },
              ]}
              onSubmit={async (v) => {
                const template = documentRequestTemplates.find((t) => t.id === v.template_id);
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                const { data: thread, error: threadError } = await supabase
                  .from("message_threads")
                  .insert({
                    workspace_id: workspaceId,
                    entity_type: "client",
                    entity_id: clientId,
                    channel: "portal",
                    subject: `Document request: ${template?.name ?? ""}`,
                    created_by: user?.id,
                  })
                  .select("id")
                  .single();
                if (threadError || !thread) return threadError?.message ?? "Could not create request.";
                const { error } = await supabase.from("messages").insert({
                  workspace_id: workspaceId,
                  thread_id: thread.id,
                  sender_type: "staff",
                  sender_id: user?.id,
                  body: `Please upload the following documents: ${template?.name ?? ""}.`,
                });
                if (error) return error.message;
                setModal(null);
                router.refresh();
              }}
            />
          )}
        </Modal>
      )}

      {modal === "invoice" && (
        <Modal title="Create invoice" onClose={() => setModal(null)}>
          <InlineAddForm
            label="Create"
            fields={[
              { name: "notes", label: "Description", required: true },
              { name: "total_amount", label: "Amount", required: true },
              { name: "due_date", label: "Due date (optional)" },
            ]}
            onSubmit={async (v) => {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              const { error } = await supabase.from("invoices").insert({
                workspace_id: workspaceId,
                client_id: clientId,
                status: "sent",
                total_amount: Number(v.total_amount) || 0,
                subtotal: Number(v.total_amount) || 0,
                notes: v.notes,
                due_date: v.due_date || null,
                created_by: user?.id,
              });
              if (error) return error.message;
              setModal(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {modal === "quote" && (
        <Modal title="Create quote" onClose={() => setModal(null)}>
          <InlineAddForm
            label="Create"
            fields={[
              { name: "title", label: "Title", required: true },
              { name: "total_amount", label: "Amount", required: true },
            ]}
            onSubmit={async (v) => {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              const { error } = await supabase.from("quotes").insert({
                workspace_id: workspaceId,
                client_id: clientId,
                title: v.title,
                total_amount: Number(v.total_amount) || 0,
                subtotal: Number(v.total_amount) || 0,
                created_by: user?.id,
              });
              if (error) return error.message;
              setModal(null);
              router.refresh();
            }}
          />
        </Modal>
      )}

      {modal === "note" && (
        <Modal title="Add note" onClose={() => setModal(null)}>
          <InlineAddForm
            label="Save"
            fields={[{ name: "body", label: "Note", required: true }]}
            onSubmit={async (v) => {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              const { error } = await supabase.from("notes").insert({
                workspace_id: workspaceId,
                entity_type: "client",
                entity_id: clientId,
                author_id: user?.id,
                body: v.body,
              });
              if (error) return error.message;
              setModal(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
