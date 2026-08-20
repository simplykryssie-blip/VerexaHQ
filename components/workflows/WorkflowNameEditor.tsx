"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function WorkflowNameEditor({ automationId, name, canEdit }: { automationId: string; name: string; canEdit: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!value.trim() || value === name) {
      setRenaming(false);
      setValue(name);
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("automations").update({ name: value.trim() }).eq("id", automationId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRenaming(false);
    router.refresh();
  }

  if (!canEdit) {
    return <h1 className="font-display text-xl font-semibold text-ink">{name}</h1>;
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          disabled={saving}
          className="rounded-lg border border-border px-2 py-1 font-display text-xl font-semibold text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        <button type="button" onClick={save} disabled={saving} className="text-xs font-medium text-accent hover:underline">
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setRenaming(false);
            setValue(name);
          }}
          className="text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <h1 className="font-display text-xl font-semibold text-ink">{name}</h1>
      <button type="button" onClick={() => setRenaming(true)} className="text-muted hover:text-ink" aria-label="Rename workflow">
        <Pencil size={14} />
      </button>
    </div>
  );
}
