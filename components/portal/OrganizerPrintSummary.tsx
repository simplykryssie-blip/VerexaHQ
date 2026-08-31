"use client";

import { Printer } from "lucide-react";
import { formatAddressValue, formatNameValue, normalizeOptions } from "@/lib/organizer/formatValue";

type FieldRow = { id: string; field_type: string; label: string; parent_field_id: string | null; options: unknown };

function formatAnswer(field: FieldRow, value: string | undefined): string {
  if (!value) return "--";
  if (field.field_type === "address") return formatAddressValue(value) || "--";
  if (field.field_type === "name") return formatNameValue(value) || "--";
  if (field.field_type === "yes_no") return value === "yes" ? "Yes" : value === "no" ? "No" : value;
  if (field.field_type === "file_upload") {
    try {
      const parsed = JSON.parse(value) as { file_name?: string };
      return parsed.file_name ?? "Uploaded";
    } catch {
      return "Uploaded";
    }
  }
  if (field.field_type === "signature") {
    try {
      const parsed = JSON.parse(value) as { typed_name?: string; signature_image_path?: string; signed_at?: string };
      const signedOn = parsed.signed_at ? ` on ${new Date(parsed.signed_at).toLocaleDateString()}` : "";
      if (parsed.typed_name) return `Signed by ${parsed.typed_name}${signedOn}`;
      if (parsed.signature_image_path) return `Signed (drawn signature)${signedOn}`;
      return "--";
    } catch {
      return "--";
    }
  }
  if (field.field_type === "dropdown" || field.field_type === "radio_button") {
    return normalizeOptions(field.options).find((o) => o.value === value)?.label ?? value;
  }
  if (field.field_type === "multiple_choice" || field.field_type === "checkbox") {
    const options = normalizeOptions(field.options);
    return value
      .split(",")
      .map((v) => options.find((o) => o.value === v)?.label ?? v)
      .join(", ");
  }
  return value;
}

// Read-only rendering of a submitted organizer, for the client's own
// records. "Download as PDF" is honestly the browser's print dialog (see
// components/reports/ExportButtons.tsx for the same convention elsewhere in
// the app) -- this component just supplies the print:hidden/print:block
// split so the interactive form chrome doesn't end up in the printout.
export function OrganizerPrintSummary({
  templateName,
  topLevelFields,
  childrenByParent,
  answers,
  repeaterRows,
}: {
  templateName: string;
  topLevelFields: FieldRow[];
  childrenByParent: Map<string, FieldRow[]>;
  answers: Record<string, string>;
  repeaterRows: Record<string, Record<string, string>[]>;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => window.print()}
        className="print:hidden inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
      >
        <Printer size={14} aria-hidden="true" /> Download as PDF
      </button>

      <div className="hidden print:block">
        <h1 className="text-lg font-semibold text-ink">{templateName}</h1>
        <div className="mt-4 space-y-3">
          {topLevelFields
            .filter((f) => f.field_type !== "page_break" && f.field_type !== "section" && f.field_type !== "rich_text")
            .map((field) =>
              field.field_type === "repeating_section" ? (
                <div key={field.id}>
                  <p className="text-sm font-medium text-ink">{field.label}</p>
                  {(repeaterRows[field.id] ?? []).map((row, i) => (
                    <div key={i} className="ml-3 mt-1 space-y-0.5">
                      {(childrenByParent.get(field.id) ?? [])
                        .filter((child) => child.field_type !== "section" && child.field_type !== "rich_text")
                        .map((child) => (
                        <p key={child.id} className="text-sm text-slate">
                          <span className="text-muted">{child.label}:</span> {formatAnswer(child, row[child.id])}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p key={field.id} className="text-sm text-slate">
                  <span className="font-medium text-ink">{field.label}:</span> {formatAnswer(field, answers[field.id])}
                </p>
              )
            )}
        </div>
      </div>
    </>
  );
}
