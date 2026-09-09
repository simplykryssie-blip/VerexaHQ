"use client";

// Catches errors thrown by the root layout itself, which app/error.tsx
// can't -- a route-segment error boundary never covers the layout it's
// nested inside. Has to render its own <html>/<body> since the root
// layout is what crashed. Rare in practice, but without this, a root
// layout crash in production shows Next's unstyled default error page
// instead of reporting to Sentry at all.
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ maxWidth: "24rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
            <p style={{ marginTop: "0.5rem", color: "#6b7280" }}>Please refresh the page.</p>
          </div>
        </div>
      </body>
    </html>
  );
}
