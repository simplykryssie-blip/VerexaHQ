"use client";

import { useEffect } from "react";

// Isolates a crash in the Quick-View drawer's render (whether from a genuine
// data-shape bug or Next's own occasional flakiness reconciling an
// intercepted route against a stale parallel-route history entry -- see
// ModalSlotGate's comment for the latter) to just this parallel slot. Without
// an error boundary here, an exception anywhere in getClientWorkspaceData()
// or the drawer's component tree propagates up through the whole (app)
// layout and 500s the entire /clients page, taking the list down with it,
// even though the list itself rendered fine. Degrading to "no drawer" (same
// as default.tsx) is a far better failure mode than losing the page: the
// user can still see and use Contacts, and clicking the row again gets a
// fresh render attempt.
export default function ClientQuickViewError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Client Quick-View drawer failed to render:", error);
  }, [error]);

  return null;
}
