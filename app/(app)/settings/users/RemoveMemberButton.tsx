"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// revoke_workspace_user already existed server-side (sets status='removed',
// permission-checked) but had no button wired to it anywhere -- once
// someone accepted an invite there was genuinely no way to remove them.
export function RemoveMemberButton({ workspaceId, userId, name }: { workspaceId: string; userId: string; name: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!window.confirm(`Remove ${name} from this workspace? They'll lose access immediately.`)) return;
    setPending(true);
    const { error } = await supabase.rpc("revoke_workspace_user", { p_workspace_id: workspaceId, p_user_id: userId });
    setPending(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`${name} removed`, "success");
    router.refresh();
  }

  return (
    <button type="button" disabled={pending} onClick={remove} className="text-xs font-medium text-danger hover:underline disabled:opacity-60">
      Remove
    </button>
  );
}
