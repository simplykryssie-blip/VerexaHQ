"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    await supabase.from("workspace_invitations").update({ status: "revoked" }).eq("id", invitationId);
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={revoke}
      className="text-xs font-medium text-danger hover:underline disabled:opacity-60"
    >
      Revoke
    </button>
  );
}
