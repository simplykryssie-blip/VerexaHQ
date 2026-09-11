"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { slugify } from "@/lib/roleSlug";
import { PublishConfirmModal } from "@/components/settings/PublishConfirmModal";
import { useToast } from "@/components/Toast";

type CreatedRow = { id: string; name: string; slug: string };

// Only asks for the two identifying fields (matches the Organizer/Engagement
// Letter create-modal pattern) -- the actual subject/body get written in the
// real composer (TemplateEditRow) immediately after, via onSuccess.
//
// `autoPublish` skips the publish prompt below and publishes immediately --
// used when this is invoked inline from a workflow step editor, where the
// template is about to be wired straight into a live automation anyway.
export function CreateTemplateForm({
  workspaceId,
  kind,
  defaultOpen,
  autoPublish,
  onSuccess,
}: {
  workspaceId: string;
  kind: "email" | "sms";
  defaultOpen?: boolean;
  autoPublish?: boolean;
  onSuccess?: (row: CreatedRow) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const table = kind === "email" ? "email_templates" : "sms_templates";
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
                status: autoPublish ? "published" : "draft",
                ...(kind === "email" ? { subject: "", body_html: "" } : { body: "" }),
              } as never)
              .select("id, name, slug")
              .single();
            if (!error && data) {
              const row = data as CreatedRow;
              if (autoPublish) {
                finish(row);
              } else {
                setPendingPublish(row);
              }
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
