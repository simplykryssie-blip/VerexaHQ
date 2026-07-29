"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

export default function AcceptEarlyAccessInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [status, setStatus] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceLoading) return;
    if (!activeWorkspaceId) {
      setStatus("error");
      setError("You need an active workspace before accepting an invitation.");
      return;
    }
    (async () => {
      const res = await authenticatedFetch("/api/early-access/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, workspaceId: activeWorkspaceId }),
      });
      const result = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!result || !result.ok) {
        setStatus("error");
        setError(result?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus("done");
      setTimeout(() => router.push("/early-access/onboarding"), 1200);
    })();
  }, [token, activeWorkspaceId, workspaceLoading, router]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {status === "working" && <p className="text-muted">Accepting your invitation…</p>}
      {status === "done" && (
        <div className="flex flex-col items-center gap-3 text-green">
          <CheckCircle2 size={40} />
          <p className="font-semibold">You&apos;re in! Taking you to onboarding…</p>
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
