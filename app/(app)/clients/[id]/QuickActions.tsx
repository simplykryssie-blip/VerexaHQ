"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MessageSquare, Upload, FileText, Receipt, StickyNote, ClipboardList, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { Modal } from "@/components/Modal";
import { SendMessageForm } from "@/components/SendMessageForm";
import { InvoiceQuoteForm } from "@/components/billing/InvoiceQuoteForm";
import { renderEmail } from "@/lib/email/template";
import type { ActionPermissions } from "@/lib/actionPermissions";

type Props = {
  clientId: string;
  clientName: string;
  workspaceId: string;
  workspaceName: string;
  documentRequestTemplates: { id: string; name: string }[];
  organizerTemplates: { id: string; name: string }[];
  primaryEmail: string | null;
  primaryPhone: string | null;
  permissions: ActionPermissions;
};

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

export function QuickActions({
  clientId,
  clientName,
  workspaceId,
  workspaceName,
  documentRequestTemplates,
  organizerTemplates,
  primaryEmail,
  primaryPhone,
  permissions,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [modal, setModal] = useState<
    "message" | "upload" | "request" | "organizer" | "invoice" | "quote" | "note" | null
  >(null);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docCategory, setDocCategory] = useState("");
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
      file_name: docName.trim() || file.name,
      storage_path: path,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      uploaded_by: user?.id,
      category: docCategory || null,
    });

    setUploading(false);
    if (insertErr) {
      setUploadError(insertErr.message);
      return;
    }

    setFile(null);
    setDocName("");
    setDocCategory("");
    setModal(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {permissions.engagementsManage && (
          <Link
            href={`/engagements/new?clientId=${clientId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
          >
            <Plus size={14} /> New Engagement
          </Link>
        )}
        {(permissions.messagesSend || permissions.messagesInternalNote) && (
          <ActionButton icon={MessageSquare} label="Send Message" onClick={() => setModal("message")} />
        )}
        {permissions.documentsUpload && <ActionButton icon={Upload} label="Upload Document" onClick={() => setModal("upload")} />}
        {permissions.documentsRequest && (
          <ActionButton icon={ClipboardList} label="Request Documents" onClick={() => setModal("request")} />
        )}
        {permissions.documentsRequest && (
          <ActionButton icon={BookOpen} label="Send Organizer" onClick={() => setModal("organizer")} />
        )}
        {permissions.billingManage && <ActionButton icon={Receipt} label="Create Invoice" onClick={() => setModal("invoice")} />}
        {permissions.billingManage && <ActionButton icon={FileText} label="Create Quote" onClick={() => setModal("quote")} />}
        <ActionButton icon={StickyNote} label="Add Note" onClick={() => setModal("note")} />
      </div>

      {modal === "message" && (
        <Modal title="Send message" onClose={() => setModal(null)}>
          <SendMessageForm
            workspaceId={workspaceId}
            entityType="client"
            entityId={clientId}
            primaryEmail={primaryEmail}
            primaryPhone={primaryPhone}
            permissions={permissions}
            onSent={() => setModal(null)}
          />
        </Modal>
      )}

      {modal === "upload" && (
        <Modal title="Upload document" onClose={() => setModal(null)}>
          <div className="space-y-3">
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !docName) setDocName(f.name.replace(/\.[^./]+$/, ""));
              }}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
            <label className="block text-sm font-medium text-slate">
              Document name
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g. 2025 W-2"
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="block text-sm font-medium text-slate">
              Category
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">Uncategorized</option>
                <option value="Tax Return">Tax Return</option>
                <option value="W-2">W-2</option>
                <option value="1099">1099</option>
                <option value="Identification">Identification</option>
                <option value="Engagement Letter">Engagement Letter</option>
                <option value="Financial Statement">Financial Statement</option>
                <option value="Correspondence">Correspondence</option>
                <option value="Other">Other</option>
              </select>
            </label>
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
              defaultOpen
              fields={[
                {
                  name: "template_id",
                  label: "Document set",
                  type: "select",
                  required: true,
                  options: documentRequestTemplates.map((t) => ({ value: t.id, label: t.name })),
                },
                { name: "due_date", label: "Due date (optional)" },
              ]}
              onSubmit={async (v) => {
                const template = documentRequestTemplates.find((t) => t.id === v.template_id);
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                const { error: rpcError } = await supabase.rpc("create_document_request", {
                  p_workspace_id: workspaceId,
                  p_entity_type: "client",
                  p_entity_id: clientId,
                  p_template_id: v.template_id,
                  p_title: template?.name ?? "Document request",
                  p_due_date: v.due_date || undefined,
                });
                if (rpcError) return rpcError.message;

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
                if (threadError || !thread) return threadError?.message ?? "Could not log the request message.";
                const { error } = await supabase.from("messages").insert({
                  workspace_id: workspaceId,
                  thread_id: thread.id,
                  sender_type: "staff",
                  sender_id: user?.id,
                  body: `Please upload the following documents: ${template?.name ?? ""}. See the Documents tab for the full checklist.`,
                });
                if (error) return error.message;
                setModal(null);
                router.refresh();
              }}
            />
          )}
        </Modal>
      )}

      {modal === "organizer" && (
        <Modal title="Send organizer" onClose={() => setModal(null)}>
          {organizerTemplates.length === 0 ? (
            <p className="text-sm text-muted">
              No organizer templates are published yet -- add one in Settings first.
            </p>
          ) : (
            <InlineAddForm
              label="Send"
              defaultOpen
              fields={[
                {
                  name: "organizer_template_id",
                  label: "Organizer",
                  type: "select",
                  required: true,
                  options: organizerTemplates.map((t) => ({ value: t.id, label: t.name })),
                },
              ]}
              onSubmit={async (v) => {
                const template = organizerTemplates.find((t) => t.id === v.organizer_template_id);
                const { error } = await supabase.from("organizer_responses").insert({
                  workspace_id: workspaceId,
                  client_id: clientId,
                  organizer_template_id: v.organizer_template_id,
                });
                if (error) return error.message;

                if (primaryEmail) {
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                  await fetch("/api/email/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      to: primaryEmail,
                      sender: "notifications",
                      subject: `New organizer to complete: ${template?.name ?? ""}`,
                      html: renderEmail({
                        heading: "An organizer is ready for you",
                        bodyHtml: `<p>Please log in to your client portal and complete the <strong>${template?.name ?? "organizer"}</strong> when you have a chance.</p>`,
                        ctaLabel: "Go to portal",
                        ctaUrl: `${appUrl}/portal/organizer`,
                      }),
                    }),
                  });
                }

                setModal(null);
                router.refresh();
              }}
            />
          )}
        </Modal>
      )}

      {modal === "invoice" && (
        <Modal title="Create invoice" onClose={() => setModal(null)} size="xl">
          <InvoiceQuoteForm
            kind="invoice"
            workspaceId={workspaceId}
            clientId={clientId}
            firmName={workspaceName}
            clientName={clientName}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}

      {modal === "quote" && (
        <Modal title="Create quote" onClose={() => setModal(null)} size="xl">
          <InvoiceQuoteForm
            kind="quote"
            workspaceId={workspaceId}
            clientId={clientId}
            firmName={workspaceName}
            clientName={clientName}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}

      {modal === "note" && (
        <Modal title="Add note" onClose={() => setModal(null)}>
          <InlineAddForm
            label="Save"
            defaultOpen
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
