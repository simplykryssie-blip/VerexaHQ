"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircleWarning } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type InformationRequestRow = {
  id: string;
  message: string;
  status: "active" | "viewed" | "responded" | "resolved";
  created_at: string;
};

// Surfaces on the organizer's own page (in addition to the sitewide sticky
// banner in the portal layout) since a client who already thinks of this
// organizer as "done" has no other reason to open it back up. Marking
// "active" requests viewed on mount is the actual read receipt staff see in
// the review workspace's Information requests list -- this is the only
// place in the client-facing app that does it.
export function InformationRequestBanner({ requests: initialRequests }: { requests: InformationRequestRow[] }) {
  const supabase = createClient();
  const [requests, setRequests] = useState(initialRequests);

  useEffect(() => {
    const activeIds = initialRequests.filter((r) => r.status === "active").map((r) => r.id);
    if (activeIds.length === 0) return;
    activeIds.forEach((id) => {
      supabase.rpc("mark_organizer_information_request_viewed", { p_request_id: id });
    });
    setRequests((prev) => prev.map((r) => (activeIds.includes(r.id) ? { ...r, status: "viewed" } : r)));
    // Only ever needs to run once per page load -- re-running on every
    // `requests` update would re-mark the same rows repeatedly for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (requests.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {requests.map((r) => (
        <div key={r.id} className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-start gap-3">
            <MessageCircleWarning size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Your preparer needs more information</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate">{r.message}</p>
              <p className="mt-2 text-xs text-muted">
                Sent {new Date(r.created_at).toLocaleDateString()} --{" "}
                <Link href="/portal/messages" className="font-medium text-accent hover:underline">
                  Reply in Messages
                </Link>
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
