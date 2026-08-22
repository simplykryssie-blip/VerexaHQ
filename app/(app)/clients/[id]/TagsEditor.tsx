"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { X, Plus } from "lucide-react";
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

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const tag = value.trim();
    if (!tag || tags.includes(tag)) {
      setValue("");
      setAdding(false);
      return;
    }
    const confirmed = await ensureTagConfirmed(supabase, workspaceId, tag);
    if (!confirmed) return;
    setValue("");
    setAdding(false);
    await saveTags([...tags, tag]);
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
        <form onSubmit={addTag} className="inline-flex items-center gap-1">
          <input
            autoFocus
            list={`workspace-tags-${workspaceId}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => !value.trim() && setAdding(false)}
            placeholder="Tag name"
            className="w-28 rounded-full border border-border px-2.5 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
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
