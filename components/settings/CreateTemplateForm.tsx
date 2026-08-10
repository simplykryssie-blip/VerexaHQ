"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { slugify } from "@/lib/roleSlug";

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
      fields={[{ name: "name", label: "Name", required: true }]}
      onSubmit={async (v) => {
        const base = slugify(v.name);
        for (let attempt = 0; attempt < 5; attempt++) {
          const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
          const { data, error } = await supabase
            .from(table)
            .insert({
              workspace_id: workspaceId,
              name: v.name,
              slug,
              status: "draft",
              ...(kind === "email" ? { subject: "", body_html: "" } : { body: "" }),
            } as never)
            .select("id, name")
            .single();
          if (!error && data) {
            router.refresh();
            onSuccess?.(data as { id: string; name: string });
            return;
          }
          if (error?.code !== "23505") return error?.message ?? "Could not create template.";
        }
        return "Could not create template -- try a slightly different name.";
      }}
    />
  );
}
