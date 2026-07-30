"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { FormFieldRow } from "@/lib/intake/engine";

export type AddressValue = { line1?: string; line2?: string; city?: string; state?: string; zip?: string };

/** Renders one form_fields row against a value + onChange, driven entirely by
 * component_type — never assumes a shape beyond what the seeded schema
 * defines (options is a plain string[] in every system template checked). */
export function FieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormFieldRow;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const options = Array.isArray(field.options) ? (field.options as unknown[]).map((o) => String(o)) : [];

  switch (field.component_type) {
    case "heading":
      return <h4 className="text-sm font-semibold mt-2">{field.label}</h4>;
    case "paragraph":
      return <p className="text-sm text-muted-foreground">{field.description ?? field.label}</p>;
    case "divider":
      return <hr className="border-border" />;
    case "textarea":
      return (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
          rows={3}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
        />
      );
    case "currency":
      return (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            type="number"
            step="0.01"
            className="pl-6"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            disabled={disabled}
          />
        </div>
      );
    case "percentage":
      return (
        <div className="relative">
          <Input
            type="number"
            className="pr-7"
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            disabled={disabled}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
        </div>
      );
    case "year":
      return (
        <Input
          type="number"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          disabled={disabled}
          placeholder="YYYY"
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        />
      );
    case "email":
      return (
        <Input
          type="email"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
        />
      );
    case "phone":
      return (
        <Input
          type="tel"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder ?? "(555) 555-5555"}
        />
      );
    case "yes_no":
      return (
        <Select value={value === true ? "yes" : value === false ? "no" : ""} onValueChange={(v) => onChange(v === "yes")} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      );
    case "single_choice":
    case "dropdown":
      return (
        <Select value={typeof value === "string" ? value : ""} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiple_choice": {
      const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-2">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(o)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  onChange(checked ? [...selected, o] : selected.filter((v) => v !== o));
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case "acknowledgment":
      return (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={value === true} disabled={disabled} onCheckedChange={(checked) => onChange(checked === true)} className="mt-0.5" />
          <span>{field.description ?? field.label}</span>
        </label>
      );
    case "address": {
      const addr: AddressValue = (value as AddressValue) ?? {};
      const update = (patch: Partial<AddressValue>) => onChange({ ...addr, ...patch });
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            className="col-span-2"
            placeholder="Street address"
            value={addr.line1 ?? ""}
            onChange={(e) => update({ line1: e.target.value })}
            disabled={disabled}
          />
          <Input
            className="col-span-2"
            placeholder="Apt / suite (optional)"
            value={addr.line2 ?? ""}
            onChange={(e) => update({ line2: e.target.value })}
            disabled={disabled}
          />
          <Input placeholder="City" value={addr.city ?? ""} onChange={(e) => update({ city: e.target.value })} disabled={disabled} />
          <Input placeholder="State" value={addr.state ?? ""} onChange={(e) => update({ state: e.target.value })} disabled={disabled} />
          <Input placeholder="ZIP" value={addr.zip ?? ""} onChange={(e) => update({ zip: e.target.value })} disabled={disabled} />
        </div>
      );
    }
    case "file_upload":
      return (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">
          Upload the supporting file for this item from the Documents tab once this organizer is submitted.
        </p>
      );
    case "signature":
      return <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3">Collected during e-signature.</p>;
    case "calculation":
      return (
        <Input value={value === null || value === undefined ? "" : String(value)} disabled readOnly className="bg-muted" />
      );
    default:
      return (
        <Input
          type="text"
          value={typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={field.placeholder ?? undefined}
        />
      );
  }
}

export function FieldLabel({ field }: { field: FormFieldRow }) {
  if (["heading", "paragraph", "divider", "acknowledgment"].includes(field.component_type)) return null;
  return (
    <Label className="flex items-center gap-1">
      {field.label}
      {field.is_required && <span className="text-destructive">*</span>}
      {field.is_staff_only && (
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Staff only</span>
      )}
    </Label>
  );
}
