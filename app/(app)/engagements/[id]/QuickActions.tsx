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
  engagementId: string;
  clientId: string;
  workspaceId: string;
  organizerTemplates: { id: string; name: string }[];
  primaryEmail: string | null;
  permissions: ActionPermissions;
};

// Mirrors the client workspace's QuickActions: Send Organizer is the only
// action without a natural tab home, so it's the only one that stays
// outside the tabs. Documents/Billing/Notes/Messages actions live in their
// tabs instead.
export function QuickActions({ engagementId, clientId, workspaceId, organizerTemplates, primaryEmail, permissions }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);

  if (!permissions.documentsRequest) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
      >
        <BookOpen size={14} /> Send Organizer
      </button>

      {open && (
        <Modal title="Send organizer" onClose={() => setOpen(false)}>
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
