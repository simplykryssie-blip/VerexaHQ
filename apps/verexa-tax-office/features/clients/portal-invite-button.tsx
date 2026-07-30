"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

export function PortalInviteButton({ clientId, portalStatus, hasEmail }: { clientId: string; portalStatus: string; hasEmail: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (portalStatus !== "not_invited") return null;

  async function invite() {
    setLoading(true);
    const res = await fetch("/api/portal/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const body = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      toast.error(body.error ?? "Couldn't send the portal invite.");
      return;
    }
    toast.success("Portal invite sent");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" disabled={loading || !hasEmail} onClick={invite} title={hasEmail ? undefined : "This client has no email address on file."}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
      Invite to portal
    </Button>
  );
}
