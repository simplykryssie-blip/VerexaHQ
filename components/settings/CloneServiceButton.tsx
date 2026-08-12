"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// System-default services (workspace_id null) are locked -- RLS requires a
// non-null workspace_id for services/processes/process_stages/process_tasks
// writes, so there's no path to edit one directly. Cloning copies the
// service + its process + all stages + all tasks into new workspace-owned
// rows via duplicate_config_object; the original stays untouched and still
// locked. Pricing/billing/organizer/document/category references are left
// pointing at whatever the original used -- only the service+process+
// stages+tasks chain is forked.
export function CloneServiceButton({ serviceId, workspaceId }: { serviceId: string; workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    setCloning(true);
    setError(null);
    const { data, error } = await supabase.rpc("duplicate_config_object", {
      p_table: "services",
      p_id: serviceId,
      p_target_workspace_id: workspaceId,
    });
    setCloning(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/settings/services/${data as string}`);
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClone}
        disabled={cloning}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
      >
        <Copy size={12} /> {cloning ? "Cloning..." : "Clone to customize"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
