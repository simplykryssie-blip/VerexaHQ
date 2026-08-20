"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RotateCcw, X } from "lucide-react";
import { loadClientDraft, clearClientDraft } from "@/lib/clientDraft";

// Maps a draft's storage key to where its form actually lives, so "Resume
// entry" can get the user back there from anywhere in the app -- not just
// from the one page that happens to render that form.
const DRAFT_ENTRY_POINTS: Record<string, { path: string; message: string }> = {
  "new-client-button": { path: "/clients", message: "You were creating a new client." },
  "new-engagement-inline": { path: "/engagements/new", message: "You were creating a new client for this engagement." },
};

// Persistent, sticky banner (not a toast) mounted once at the app-shell
// layout so it's reachable from wherever "View existing client" lands the
// user -- a duplicate-match check can happen on /clients or /engagements/new,
// but the existing client's own profile page is a third page where neither
// form is mounted, so a page-local banner alone can never be seen there.
export function GlobalClientDraftBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const found = Object.keys(DRAFT_ENTRY_POINTS).find((key) => loadClientDraft(key) !== null);
    setActiveKey(found ?? null);
  }, [pathname]);

  if (!activeKey) return null;
  const entry = DRAFT_ENTRY_POINTS[activeKey];
  if (!entry) return null;

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-ink">
      <span>{entry.message} Resume it or discard the unsaved entry.</span>
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => router.push(`${entry.path}?resumeClientDraft=${activeKey}`)}
          className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
        >
          <RotateCcw size={13} /> Resume entry
        </button>
        <button
          type="button"
          onClick={() => {
            clearClientDraft(activeKey);
            setActiveKey(null);
          }}
          className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink"
        >
          <X size={13} /> Discard
        </button>
      </div>
    </div>
  );
}
