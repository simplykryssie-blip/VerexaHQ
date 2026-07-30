"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function GlobalErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log technical detail server-side (picked up by the hosting
    // platform's log pipeline) — never shown to the user directly.
    console.error("[verexa-tax-office] unhandled error", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-secondary/40">
      <div className="mb-8">
        <Logo />
      </div>
      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        We hit an unexpected error. Nothing you entered was lost — try again, and contact support if it
        keeps happening.
      </p>
      <Button variant="brand" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
