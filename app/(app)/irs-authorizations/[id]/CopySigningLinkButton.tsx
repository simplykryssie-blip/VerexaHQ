"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

export function CopySigningLinkButton({ accessToken }: { accessToken: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/sign/${accessToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.show("Signing link copied", "success");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copyLink} className="text-xs font-medium text-accent hover:underline">
      {copied ? "Copied!" : "Copy signing link"}
    </button>
  );
}
