"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// "Delete" archives rather than hard-deletes: engagements have CASCADE
// foreign keys from tasks, engagement_tax_details, and organizer_responses,
// so a real delete can silently destroy that data with no undo. Archiving
// reuses the engagement's own existing status value and RLS gate instead.
export function DeleteEngagementButton({ engagementId, workspaceId }: { engagementId: string; workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this engagement? It will be archived and removed from active views. This can be undone by an admin changing its status back.")) return;
    setDeleting(true);
    const { error } = await supabase.from("engagements").update({ status: "archived" }).eq("id", engagementId).eq("workspace_id", workspaceId);
    setDeleting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Engagement archived", "success");
    router.push("/engagements");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-danger transition hover:border-danger disabled:opacity-60"
    >
      <Trash2 size={13} /> {deleting ? "Deleting..." : "Delete"}
    </button>
  );
}
