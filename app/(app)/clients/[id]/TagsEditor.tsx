"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { X, Plus, Check } from "lucide-react";
import { ensureTagConfirmed } from "@/lib/ensureTag";

export function TagsEditor({
  clientId,
  workspaceId,
  tags,
  suggestions,
}: {
  clientId: string;
  workspaceId: string;
  tags: string[];
  suggestions: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveTags(next: string[]) {
    setBusy(true);
    const { error } = await supabase.from("clients").update({ tags: next }).eq("id", clientId);
    setBusy(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }

  async function commitTag(raw: string) {
    const tag = raw.trim();
    setValue("");
    setAdding(false);
    if (!tag || tags.includes(tag)) return;
    const confirmed = await ensureTagConfirmed(supabase, workspaceId, tag);
    if (!confirmed) return;
    await saveTags([...tags, tag]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await commitTag(value);
  }

  // Picking a suggestion from the input's native datalist dropdown fills the
  // box but doesn't submit the form -- only Enter (handleSubmit) did, so an
  // existing tag chosen with the mouse had no way to actually get saved.
  // Clicking away is now a save too (skipped quietly when the box is empty,
  // i.e. just clicking away with nothing typed), matching the "Add" button.
  async function handleBlur() {
    if (!value.trim()) {
      setAdding(false);
      return;
    }
    await commitTag(value);
  }

  async function removeTag(tag: string) {
    await saveTags(tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accentSoft px-2.5 py-1 text-xs font-medium text-accent">
          {t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            disabled={busy}
            className="text-accent/70 hover:text-accent disabled:opacity-50"
            aria-label={`Remove tag ${t}`}
          >
            <X size={11} />
          </button>
        </span>
      ))}

      {adding ? (
        <form onSubmit={handleSubmit} className="inline-flex items-center gap-1">
          <input
            autoFocus
            list={`workspace-tags-${workspaceId}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleBlur}
            placeholder="Tag name"
            className="w-28 rounded-full border border-border px-2.5 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            onMouseDown={(e) => e.preventDefault()}
            disabled={busy || !value.trim()}
            aria-label="Save tag"
            className="rounded-full bg-accent p-1 text-white hover:bg-accent/90 disabled:opacity-40"
          >
            <Check size={11} />
          </button>
          <datalist id={`workspace-tags-${workspaceId}`}>
            {suggestions.filter((s) => !tags.includes(s)).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted hover:border-accent hover:text-accent"
        >
          <Plus size={11} /> Add tag
        </button>
      )}
    </div>
  );
}
