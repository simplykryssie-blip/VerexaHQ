"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { Modal } from "@/components/Modal";
import { renderEmail } from "@/lib/email/template";
import type { ActionPermissions } from "@/lib/actionPermissions";

type Props = {
  clientId: string;
  workspaceId: string;
  organizerTemplates: { id: string; name: string }[];
  pendingOrganizerTemplateIds: string[];
  primaryEmail: string | null;
  permissions: ActionPermissions;
};

// Send Organizer is the one action every workflow touches regardless of
// which tab staff happen to be on, so it's the only one that stays outside
// the tabs. Everything else (documents, billing, notes, messaging) now
// lives in the tab it belongs to.
export function QuickActions({ clientId, workspaceId, organizerTemplates, pendingOrganizerTemplateIds, primaryEmail, permissions }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  if (!permissions.documentsRequest) return null;

  const pendingSet = new Set(pendingOrganizerTemplateIds);
  const pendingTemplates = organizerTemplates.filter((t) => pendingSet.has(t.id));
  const availableTemplates = organizerTemplates.filter((t) => !pendingSet.has(t.id));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
      >
        <BookOpen size={14} /> Send Organizer
      </button>

      {open && (
        <Modal title="Send organizer" onClose={() => setOpen(false)}>
          {pendingTemplates.length > 0 && (
            <p className="mb-3 text-sm text-muted">
              Already sent and still pending, so not shown below: {pendingTemplates.map((t) => t.name).join(", ")}.
            </p>
          )}
          {organizerTemplates.length === 0 ? (
            <p className="text-sm text-muted">
              No organizer templates are published yet -- add one in Settings first.
            </p>
          ) : availableTemplates.length === 0 ? (
            <p className="text-sm text-muted">
              Every published organizer is already sent and awaiting the client -- nothing new to send right now.
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
                  options: availableTemplates.map((t) => ({ value: t.id, label: t.name })),
                },
              ]}
              onSubmit={async (v) => {
                if (pendingSet.has(v.organizer_template_id)) {
                  return "This organizer is already sent and still pending for this client.";
                }
                const template = organizerTemplates.find((t) => t.id === v.organizer_template_id);
                const { error } = await supabase.from("organizer_responses").insert({
                  workspace_id: workspaceId,
                  client_id: clientId,
                  organizer_template_id: v.organizer_template_id,
                });
                if (error) return error.message;

                if (primaryEmail) {
                  const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
                  const emailRes = await fetch("/api/email/send", {
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
                  const emailResult = await emailRes.json().catch(() => null);
                  router.refresh();
                  if (!emailRes.ok || !emailResult?.sent) {
                    return "Organizer created, but the notification email couldn't be sent. The client won't know it's waiting for them until you tell them directly.";
                  }
                }

                setOpen(false);
                router.refresh();
              }}
            />
          )}
        </Modal>
      )}
    </>
  );
}
