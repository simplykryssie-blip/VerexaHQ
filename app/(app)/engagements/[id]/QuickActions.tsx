"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { Modal } from "@/components/Modal";
import { sendOrganizerToEngagement } from "@/lib/organizer/sendOrganizerToEngagement";
import type { ActionPermissions } from "@/lib/actionPermissions";

type Props = {
  engagementId: string;
  clientId: string;
  workspaceId: string;
  organizerTemplates: { id: string; name: string }[];
  pendingOrganizerTemplateIds: string[];
  primaryEmail: string | null;
  permissions: ActionPermissions;
};

// Mirrors the client workspace's QuickActions: Send Organizer is the only
// action without a natural tab home, so it's the only one that stays
// outside the tabs. Documents/Billing/Notes/Messages actions live in their
// tabs instead.
export function QuickActions({ engagementId, clientId, workspaceId, organizerTemplates, pendingOrganizerTemplateIds, primaryEmail, permissions }: Props) {
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
                if (!template) return "Select an organizer.";
                const errorMessage = await sendOrganizerToEngagement({
                  supabase,
                  workspaceId,
                  clientId,
                  engagementId,
                  template,
                  primaryEmail,
                  appUrl: process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
                });
                if (errorMessage) return errorMessage;

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
