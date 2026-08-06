"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

export function CreateOrganizerTemplateForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();

  return (
    <InlineAddForm
      label="New Organizer"
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "slug", label: "Slug (unique key)", required: true },
        { name: "description", label: "Description", type: "textarea" },
      ]}
      onSubmit={async (v) => {
        const { error } = await supabase.from("organizer_templates").insert({
          workspace_id: workspaceId,
          name: v.name,
          slug: v.slug,
          description: v.description || null,
          status: "draft",
        });
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}
