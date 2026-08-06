"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { InlineAddForm } from "@/components/InlineAddForm";

const FIELD_TYPES = [
  "short_text",
  "paragraph",
  "number",
  "currency",
  "date",
  "dropdown",
  "checkbox",
  "radio_button",
  "multiple_choice",
  "address",
  "ssn",
  "ein",
  "file_upload",
  "signature",
  "repeating_section",
] as const;

const CHOICE_TYPES = new Set(["dropdown", "radio_button", "multiple_choice"]);

export type OrganizerFieldRow = {
  id: string;
  field_type: string;
  label: string;
  is_required: boolean;
  display_order: number;
  options: unknown;
};

export type OrganizerTemplateRowData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  workspace_id: string | null;
};

function optionsToText(options: unknown): string {
  if (Array.isArray(options)) return options.map((o) => String(o)).join(", ");
  return "";
}

function FieldRow({ field, onDeleted }: { field: OrganizerFieldRow; onDeleted: () => void }) {
  const supabase = createClient();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!confirm(`Remove the "${field.label}" question?`)) return;
    setDeleting(true);
    const { error } = await supabase.from("organizer_fields").delete().eq("id", field.id);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    onDeleted();
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <div>
        <span className="text-slate">{field.label}</span>
        <span className="ml-2 text-xs text-muted">
          {field.field_type.replace(/_/g, " ")}
          {field.is_required && " -- required"}
          {CHOICE_TYPES.has(field.field_type) && optionsToText(field.options) && `: ${optionsToText(field.options)}`}
        </span>
      </div>
      <button type="button" onClick={remove} disabled={deleting} className="text-xs font-medium text-danger hover:underline disabled:opacity-60">
        Remove
      </button>
    </li>
  );
}

export function OrganizerTemplateRow({ template, fields }: { template: OrganizerTemplateRowData; fields: OrganizerFieldRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const isSystem = !template.workspace_id;
  const sortedFields = [...fields].sort((a, b) => a.display_order - b.display_order);

  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-left text-sm font-medium text-ink hover:text-accent hover:underline">
        {template.name}
      </button>
      {template.description && <p className="text-xs text-muted">{template.description}</p>}

      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-border bg-surfaceMuted p-3">
          {sortedFields.length === 0 ? (
            <p className="text-sm text-muted">No questions yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {sortedFields.map((f) => (
                <FieldRow key={f.id} field={f} onDeleted={() => router.refresh()} />
              ))}
            </ul>
          )}

          {isSystem ? (
            <p className="text-xs text-muted">This is a system default and its questions can&apos;t be edited here.</p>
          ) : (
            <InlineAddForm
              label="Add Question"
              defaultOpen={false}
              fields={[
                { name: "label", label: "Question", required: true },
                {
                  name: "field_type",
                  label: "Answer type",
                  type: "select",
                  required: true,
                  options: FIELD_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
                },
                { name: "options", label: "Choices (comma-separated, for dropdown/radio/multiple choice)" },
                { name: "is_required", label: "Required? (yes/no)" },
              ]}
              onSubmit={async (v) => {
                const nextOrder = sortedFields.length > 0 ? Math.max(...sortedFields.map((f) => f.display_order)) + 1 : 0;
                const options = v.options
                  ? v.options
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean)
                  : [];
                const { error } = await supabase.from("organizer_fields").insert({
                  organizer_template_id: template.id,
                  field_type: v.field_type,
                  label: v.label,
                  is_required: v.is_required?.trim().toLowerCase() === "yes",
                  display_order: nextOrder,
                  options,
                });
                if (error) return error.message;
                router.refresh();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
