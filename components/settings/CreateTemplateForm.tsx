"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

// Only asks for the two identifying fields (matches the Organizer/Engagement
// Letter create-modal pattern) -- the actual subject/body get written in the
// real composer (TemplateEditRow) immediately after, via onSuccess.
export function CreateTemplateForm({
  workspaceId,
  kind,
  defaultOpen,
  onSuccess,
}: {
  workspaceId: string;
  kind: "email" | "sms";
  defaultOpen?: boolean;
  onSuccess?: (row: { id: string; name: string }) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const table = kind === "email" ? "email_templates" : "sms_templates";

  return (
    <InlineAddForm
      label="New Template"
      defaultOpen={defaultOpen}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "slug", label: "Slug (unique key)", required: true },
      ]}
      onSubmit={async (v) => {
        const { data, error } = await supabase
          .from(table)
          .insert({
            workspace_id: workspaceId,
            name: v.name,
            slug: v.slug,
            status: "draft",
            ...(kind === "email" ? { subject: "", body_html: "" } : { body: "" }),
          } as never)
          .select("id, name")
          .single();
        if (error || !data) return error?.message ?? "Could not create template.";
        router.refresh();
        onSuccess?.(data as { id: string; name: string });
      }}
    />
  );
}
