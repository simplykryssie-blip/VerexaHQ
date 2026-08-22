"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function PipelineNameEditor({ processId, name, canEdit }: { processId: string; name: string; canEdit: boolean }) {
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
    const { error } = await supabase.from("processes").update({ name: value.trim() }).eq("id", processId);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRenaming(false);
    router.refresh();
  }

  if (!canEdit) {
    return <h2 className="text-base font-semibold text-ink">{name}</h2>;
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
          className="rounded-lg border border-border px-2 py-1 text-base font-semibold text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
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
      <h2 className="text-base font-semibold text-ink">{name}</h2>
      <button type="button" onClick={() => setRenaming(true)} className="text-muted hover:text-ink" aria-label="Rename pipeline">
        <Pencil size={13} />
      </button>
    </div>
  );
}
