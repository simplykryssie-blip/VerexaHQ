"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "select" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
};

export function InlineAddForm({
  label,
  fields,
  onSubmit,
  defaultOpen = false,
}: {
  label: string;
  fields: FieldDef[];
  onSubmit: (values: Record<string, string>) => Promise<string | void>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await onSubmit(values);
    setLoading(false);
    if (result) {
      setError(result);
      return;
    }
    setValues({});
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
      >
        <Plus size={14} /> {label}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surfaceMuted p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) =>
          f.type === "textarea" ? (
            <textarea
              key={f.name}
              required={f.required}
              placeholder={f.label}
              rows={4}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="col-span-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          ) : f.type === "select" ? (
            <select
              key={f.name}
              required={f.required}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="" disabled>
                {f.label}
              </option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={f.name}
              type={f.type ?? "text"}
              required={f.required}
              placeholder={f.label}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          )
        )}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
