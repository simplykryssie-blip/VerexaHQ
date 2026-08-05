"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

export function CreateTemplateForm({ workspaceId, kind }: { workspaceId: string; kind: "email" | "sms" | "engagement_letter" }) {
  const router = useRouter();
  const supabase = createClient();

  const table = kind === "email" ? "email_templates" : kind === "sms" ? "sms_templates" : "engagement_letter_templates";
  const bodyField = kind === "sms" ? "body" : "body_html";
  const bodyLabel = kind === "sms" ? "Message (use {{merge_fields}})" : "Body HTML (use {{merge_fields}})";

  const fields = [
    { name: "name", label: "Name", required: true },
    { name: "slug", label: "Slug (unique key)", required: true },
    ...(kind === "email" ? [{ name: "subject", label: "Subject", required: true }] : []),
    { name: bodyField, label: bodyLabel, required: true, type: "textarea" as const },
  ];

  return (
    <InlineAddForm
      label="New Template"
      fields={fields}
      onSubmit={async (v) => {
        const { error } = await supabase.from(table).insert({
          workspace_id: workspaceId,
          name: v.name,
          slug: v.slug,
          ...(kind === "email" ? { subject: v.subject, body_html: v.body_html } : {}),
          ...(kind === "sms" ? { body: v.body } : {}),
          ...(kind === "engagement_letter" ? { body_html: v.body_html } : {}),
          status: "draft",
        } as never);
        if (error) return error.message;
        router.refresh();
      }}
    />
  );
}
