"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/Toast";

export function ResendInvitationButton({ email, roleId }: { email: string; roleId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  async function resend() {
    setSending(true);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, roleId }),
    });
    const data = await res.json();
    setSending(false);
    if (!res.ok) {
      toast.show(data.error ?? "Could not resend the invitation.", "error");
      return;
    }
    toast.show(data.email?.sent ? `Invitation resent to ${email}.` : "Invitation refreshed, but email delivery isn't configured yet.", "success");
    router.refresh();
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={resend} disabled={sending}>
      {sending ? "Resending..." : "Resend"}
    </Button>
  );
}
