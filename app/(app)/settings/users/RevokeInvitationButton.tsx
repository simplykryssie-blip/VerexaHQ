"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function revoke() {
    setPending(true);
    const { error } = await supabase.from("workspace_invitations").update({ status: "revoked" }).eq("id", invitationId);
    setPending(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Invitation revoked", "success");
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
