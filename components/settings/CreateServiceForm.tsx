"use client";

import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";
import { slugify } from "@/lib/roleSlug";

type Option = { id: string; name: string };

export function CreateServiceForm({
  workspaceId,
  categories,
  defaultOpen,
  onSuccess,
}: {
  workspaceId: string;
  categories: Option[];
  defaultOpen?: boolean;
  onSuccess?: (id: string) => void;
}) {
  const supabase = createClient();

  const toOptions = (rows: Option[]) => rows.map((r) => ({ value: r.id, label: r.name }));

  return (
    <InlineAddForm
      label="New Service Package"
      defaultOpen={defaultOpen}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "service_category_id", label: "Category", type: "select", options: toOptions(categories) },
      ]}
      onSubmit={async (v) => {
        const base = slugify(v.name);
        for (let attempt = 0; attempt < 5; attempt++) {
          const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
          const { data, error } = await supabase
            .from("services")
            .insert({
              workspace_id: workspaceId,
              name: v.name,
              slug,
              service_category_id: v.service_category_id || null,
              status: "draft",
            })
            .select("id")
            .single();
          if (!error && data) {
            onSuccess?.(data.id);
            return;
          }
          if (error && error.code !== "23505") return error.message;
        }
        return "Could not create service -- try a slightly different name.";
      }}
    />
  );
}
