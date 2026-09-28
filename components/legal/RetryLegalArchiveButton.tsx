"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Admin-only control (the underlying route re-checks is_platform_admin()
// itself, so this button being hidden from non-admins in the UI is a
// convenience, not the actual authorization boundary).
export function RetryLegalArchiveButton({ archiveId }: { archiveId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/platform-admin/legal-archive/${archiveId}/retry`, { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Retry failed.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="text-xs font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Retrying..." : "Retry"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
