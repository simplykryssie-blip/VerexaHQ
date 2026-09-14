"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

// Distinct from RemoveMemberButton's revoke_workspace_user (immediate loss
// of access): release_sponsored_staff_member keeps their existing access
// through this workspace's already-paid billing period, and only starts
// the "set up your own billing or be suspended" clock from there -- see
// supabase/migrations/20261012000000_sponsored_staff_release_billing_transition.sql.
export function ReleaseMemberButton({ workspaceId, userId, name }: { workspaceId: string; userId: string; name: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function release() {
    if (
      !window.confirm(
        `Release ${name} from this workspace? They'll keep full access through the end of your current billing period. After that, they'll need to set up their own Verexa billing to keep using their account -- nothing is charged to you, and nothing is auto-charged to them.`
      )
    ) {
      return;
    }
    setPending(true);
    const { error } = await supabase.rpc("release_sponsored_staff_member", { p_workspace_id: workspaceId, p_user_id: userId });
    setPending(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`${name} has been released. They'll keep access through the end of this billing period.`, "success");
    router.refresh();
  }

  return (
    <button type="button" disabled={pending} onClick={release} className="text-xs font-medium text-slate hover:text-ink hover:underline disabled:opacity-60">
      Release
    </button>
  );
}
