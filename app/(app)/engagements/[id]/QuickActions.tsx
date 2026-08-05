"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Upload, Receipt, FileText, StickyNote, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { Modal } from "@/components/Modal";
import { renderEmail } from "@/lib/email/template";
import type { ActionPermissions } from "@/lib/actionPermissions";

type Props = {
  engagementId: string;
  clientId: string;
  workspaceId: string;
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
  icon: typeof MessageSquare;
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

export function QuickActions({ engagementId, clientId, workspaceId, organizerTemplates, primaryEmail, primaryPhone, permissions }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [modal, setModal] = useState<"message" | "upload" | "organizer" | "invoice" | "quote" | "note" | null>(null);
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
      entity_type: "engagement",
      entity_id: engagementId,
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
        {(permissions.messagesSend || permissions.messagesInternalNote) && (
          <ActionButton icon={MessageSquare} label="Send Message" onClick={() => setModal("message")} />
        )}
        {permissions.documentsUpload && <ActionButton icon={Upload} label="Upload Document" onClick={() => setModal("upload")} />}
        {permissions.documentsRequest && (
          <ActionButton icon={BookOpen} label="Send Organizer" onClick={() => setModal("organizer")} />
        )}
        {permissions.billingManage && <ActionButton icon={Receipt} label="Create Invoice" onClick={() => setModal("invoice")} />}
        {permissions.billingManage && <ActionButton icon={FileText} label="Create Quote" onClick={() => setModal("quote")} />}
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
                  ...(permissions.messagesSend
                    ? [
                        { value: "portal", label: "Client portal inbox" },
                        { value: "email", label: `Email${primaryEmail ? ` (${primaryEmail})` : " -- no email on file"}` },
                        { value: "sms", label: `SMS${primaryPhone ? ` (${primaryPhone})` : " -- no phone on file"}` },
                      ]
                    : []),
                  ...(permissions.messagesInternalNote ? [{ value: "internal", label: "Internal note (staff only)" }] : []),
                ],
              },
              { name: "body", label: "Message", required: true },
            ]}
            onSubmit={async (v) => {
              if (v.channel === "email" && !primaryEmail) return "This client has no email on file -- add one in Contacts first.";
              if (v.channel === "sms" && !primaryPhone) return "This client has no phone number on file -- add one in Contacts first.";

              const isInternal = v.channel === "internal";
              const {
                data: { user },
              } = await supabase.auth.getUser();
              const { data: thread, error: threadError } = await supabase
                .from("message_threads")
                .insert({
                  workspace_id: workspaceId,
                  entity_type: "engagement",
                  entity_id: engagementId,
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

              if (v.channel === "email" && primaryEmail) {
                await fetch("/api/email/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ to: primaryEmail, subject: "New message", html: `<p>${v.body}</p>` }),
                });
              } else if (v.channel === "sms" && primaryPhone) {
                await fetch("/api/sms/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ to: primaryPhone, body: v.body }),
                });
              }

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

      {modal === "organizer" && (
        <Modal title="Send organizer" onClose={() => setModal(null)}>
          {organizerTemplates.length === 0 ? (
            <p className="text-sm text-muted">
              No organizer templates are published yet -- add one in Settings first.
            </p>
          ) : (
            <InlineAddForm
              label="Send"
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
                  engagement_id: engagementId,
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
        <Modal title="Create invoice" onClose={() => setModal(null)}>
          <InlineAddForm
            label="Create"
            fields={[
              { name: "notes", label: "Description", required: true },
              { name: "total_amount", label: "Amount", required: true },
              { name: "due_date", label: "Payment due date (optional)" },
            ]}
            onSubmit={async (v) => {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              const { error } = await supabase.from("invoices").insert({
                workspace_id: workspaceId,
                client_id: clientId,
                engagement_id: engagementId,
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
                engagement_id: engagementId,
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
                entity_type: "engagement",
                entity_id: engagementId,
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
