"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export const dynamic = 'force-dynamic';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surfaceMuted px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted">{error.message}</p>
        <button
          onClick={() => reset()}
          className="mt-4 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
