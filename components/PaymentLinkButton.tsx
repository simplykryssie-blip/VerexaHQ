"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

export function PaymentLinkButton({ invoiceId }: { invoiceId: string }) {
  const toast = useToast();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "unconfigured" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function getLink() {
    setState("loading");
    const res = await fetch("/api/stripe/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setState("error");
      setMessage(data.error ?? "Could not create a payment link.");
      toast.show(data.error ?? "Could not create a payment link.", "error");
      return;
    }
    if (!data.configured) {
      setState("unconfigured");
      setMessage(data.reason);
      return;
    }
    setUrl(data.url);
    setState("ready");
  }

  if (state === "ready" && url) {
    return (
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url);
          toast.show("Payment link copied to clipboard", "success");
        }}
        className="text-xs font-medium text-accent hover:underline"
      >
        Copy payment link
      </button>
    );
  }

  if (state === "unconfigured" || state === "error") {
    return <span className="text-xs text-muted">{message}</span>;
  }

  return (
    <button
      type="button"
      disabled={state === "loading"}
      onClick={getLink}
      className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
    >
      {state === "loading" ? "Creating link..." : "Get payment link"}
    </button>
  );
}
