"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { Pencil } from "lucide-react";

export function AddEngagementNoteForm({
  engagementId,
  workspaceId,
}: {
  engagementId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="New Note"
      fields={[
        { name: "subject", label: "Subject" },
        { name: "body", label: "Note", type: "textarea", required: true },
      ]}
      onSubmit={async (v) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.from("notes").insert({
          workspace_id: workspaceId,
          entity_type: "engagement",
          entity_id: engagementId,
          author_id: user?.id,
          subject: v.subject || null,
          body: v.body,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}

export function EditEngagementNoteForm({ note }: { note: { id: string; subject: string | null; body: string } }) {
  const router = useRouter();
  const supabase = createClient();
  return (
    <InlineAddForm
      label="Edit"
      submitLabel="Save changes"
      initialValues={{ subject: note.subject ?? "", body: note.body }}
      fields={[
        { name: "subject", label: "Subject" },
        { name: "body", label: "Note", type: "textarea", required: true },
      ]}
      trigger={(openForm) => (
        <button type="button" onClick={openForm} className="text-muted hover:text-ink" aria-label="Edit note">
          <Pencil size={13} />
        </button>
      )}
      onSubmit={async (v) => {
        const { error } = await supabase
          .from("notes")
          .update({ subject: v.subject || null, body: v.body })
          .eq("id", note.id);
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}
