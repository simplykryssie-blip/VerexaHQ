"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

export function StartOrganizerForm({
  workspaceId,
  clientId,
  templates,
}: {
  workspaceId: string;
  clientId: string;
  templates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();

  return (
    <InlineAddForm
      label="Start Organizer"
      fields={[
        {
          name: "organizer_template_id",
          label: "Organizer",
          type: "select",
          required: true,
          options: templates.map((t) => ({ value: t.id, label: t.name })),
        },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("organizer_responses").insert({
          workspace_id: workspaceId,
          client_id: clientId,
          organizer_template_id: v.organizer_template_id,
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}
