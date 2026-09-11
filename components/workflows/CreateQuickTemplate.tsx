"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { slugify } from "@/lib/roleSlug";
import { PublishConfirmModal } from "@/components/settings/PublishConfirmModal";
import { useToast } from "@/components/Toast";

type CreatedRow = { id: string; name: string };

// Organizer and engagement letter templates need their full builder page for
// actual content (a drag/drop field list, or a rich-text body with merge
// fields and signature settings) -- there's no small modal composer for
// either. This only creates the stub row (name, and description for
// organizers) so it exists and can be picked here immediately; the caller is
// expected to link out to the real builder to finish it.
export function CreateQuickTemplate({
  workspaceId,
  kind,
  defaultOpen,
  onSuccess,
}: {
  workspaceId: string;
  kind: "organizer" | "engagement_letter";
  defaultOpen?: boolean;
  onSuccess?: (row: CreatedRow) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const table = kind === "organizer" ? "organizer_templates" : "engagement_letter_templates";
  const [pendingPublish, setPendingPublish] = useState<CreatedRow | null>(null);
  const [publishing, setPublishing] = useState(false);

  function finish(row: CreatedRow) {
    router.refresh();
    onSuccess?.(row);
  }

  return (
    <>
      <InlineAddForm
        label="New Template"
        defaultOpen={defaultOpen}
        fields={
          kind === "organizer"
            ? [
                { name: "name", label: "Name", required: true },
                { name: "description", label: "Description (optional)", type: "textarea" },
              ]
            : [{ name: "name", label: "Name", required: true }]
        }
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
                ...(kind === "organizer" ? { description: v.description || null } : { body_html: "<p></p>" }),
              } as never)
              .select("id, name")
              .single();
            if (!error && data) {
              setPendingPublish(data as CreatedRow);
              return;
            }
            if (error?.code !== "23505") return error?.message ?? "Could not create template.";
          }
          return "Could not create template -- try a slightly different name.";
        }}
      />
      {pendingPublish && (
        <PublishConfirmModal
          templateName={pendingPublish.name}
          publishing={publishing}
          onSkip={() => {
            const row = pendingPublish;
            setPendingPublish(null);
            finish(row);
          }}
          onPublish={async () => {
            setPublishing(true);
            const { error } = await supabase.from(table).update({ status: "published" } as never).eq("id", pendingPublish.id);
            setPublishing(false);
            if (error) {
              toast.show(error.message, "error");
              return;
            }
            const row = pendingPublish;
            setPendingPublish(null);
            finish(row);
          }}
        />
      )}
    </>
  );
}
