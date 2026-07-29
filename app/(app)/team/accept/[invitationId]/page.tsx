"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";

export default function AcceptTeamInvitationPage() {
  const { invitationId } = useParams<{ invitationId: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: acceptError } = await supabase.rpc("accept_my_workspace_member_invitation", {
        p_invitation_id: invitationId,
      });
      if (acceptError || !data?.ok) {
        setStatus("error");
        setError(friendlyError(acceptError, "This invitation link is invalid, expired, or was sent to a different email address."));
        return;
      }
      setStatus("done");
      setTimeout(() => router.push("/dashboard"), 1500);
    })();
  }, [invitationId, router]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {status === "working" && <p className="text-muted">Accepting your invitation…</p>}
      {status === "done" && (
        <div className="flex flex-col items-center gap-3 text-green">
          <CheckCircle2 size={40} />
          <p className="font-semibold">You&apos;re in! Taking you to your dashboard…</p>
        </div>
      )}
      {status === "error" && (
        <div className="flex flex-col items-center gap-3">
          <XCircle size={40} className="text-brick" />
          <p className="text-sm text-brick">{error}</p>
        </div>
      )}
    </div>
  );
}
