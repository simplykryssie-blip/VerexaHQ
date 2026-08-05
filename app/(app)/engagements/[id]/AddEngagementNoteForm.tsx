"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

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
        { name: "body", label: "Note", required: true },
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
