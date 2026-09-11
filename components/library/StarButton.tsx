"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { StarEntityType } from "@/components/library/types";

// Self-contained toggle -- takes only the current starred state and writes
// straight to starred_items on click, same pattern as TemplateStatusCycle.
// Every list (Form Templates x3, Workflows, Pipelines, Websites) renders the
// same button; only entityType/entityId change per caller.
export function StarButton({
  workspaceId,
  entityType,
  entityId,
  starred,
  label,
  alwaysVisible = false,
}: {
  workspaceId: string;
  entityType: StarEntityType;
  entityId: string;
  starred: boolean;
  label: string;
  /** Grid-card layouts show every action icon at all times (matching Copy/Delete there) -- only dense list rows hide it until hover. */
  alwaysVisible?: boolean;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [isStarred, setIsStarred] = useState(starred);
  const [saving, setSaving] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    const next = !isStarred;
    setIsStarred(next);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setIsStarred(!next);
      setSaving(false);
      return;
    }

    const { error } = next
      ? await supabase.from("starred_items").insert({ user_id: user.id, workspace_id: workspaceId, entity_type: entityType, entity_id: entityId })
      : await supabase.from("starred_items").delete().eq("user_id", user.id).eq("entity_type", entityType).eq("entity_id", entityId);

    setSaving(false);
    if (error) {
      setIsStarred(!next);
      toast.show(error.message, "error");
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={saving}
      aria-label={isStarred ? `Unstar ${label}` : `Star ${label}`}
      aria-pressed={isStarred}
      className={`shrink-0 rounded p-1 transition disabled:opacity-50 ${
        isStarred
          ? "text-amber-500 hover:text-amber-600"
          : alwaysVisible
            ? "text-muted hover:text-amber-500"
            : "text-muted opacity-0 hover:text-amber-500 group-hover:opacity-100"
      }`}
    >
      <Star size={14} fill={isStarred ? "currentColor" : "none"} aria-hidden="true" />
    </button>
  );
}
