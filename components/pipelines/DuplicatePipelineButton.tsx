"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function DuplicatePipelineButton({ processId, workspaceId, name }: { processId: string; workspaceId: string; name: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [duplicating, setDuplicating] = useState(false);

  async function duplicate() {
    setDuplicating(true);
    const { data, error } = await supabase.rpc("duplicate_config_object", {
      p_table: "processes",
      p_id: processId,
      p_target_workspace_id: workspaceId,
      p_new_name: `${name} (copy)`,
    });
    setDuplicating(false);
    if (error || !data) {
      toast.show(error?.message ?? "Could not duplicate the pipeline", "error");
      return;
    }
    toast.show("Pipeline duplicated -- opening your editable copy", "success");
    router.push(`/pipelines/${data}`);
  }

  return (
    <button
      type="button"
      onClick={duplicate}
      disabled={duplicating}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate hover:border-accent hover:text-ink disabled:opacity-50"
    >
      <Copy size={13} /> {duplicating ? "Duplicating..." : "Duplicate"}
    </button>
  );
}
