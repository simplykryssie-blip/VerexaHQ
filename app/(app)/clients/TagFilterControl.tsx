"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Filter } from "lucide-react";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

export function TagFilterControl({
  tags,
  activeTag,
  baseHref,
}: {
  tags: string[];
  activeTag: string;
  baseHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useDropdownDismiss<HTMLDivElement>(open, () => setOpen(false));

  const filtered = tags.filter((t) => t.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
      >
        <Filter size={13} aria-hidden="true" />
        {activeTag ? `Tag: ${activeTag}` : "Filter by tag"}
      </button>
      {open && (
        <DropdownPanel className="left-0 mt-1 w-64 p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tags..."
            className="mb-1.5 w-full rounded-lg border border-border px-2 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="max-h-64 overflow-y-auto">
            <Link
              href={baseHref}
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-surfaceMuted ${
                !activeTag ? "text-accent" : "text-slate"
              }`}
            >
              <span>All</span>
              {!activeTag && <Check size={13} aria-hidden="true" />}
            </Link>
            {filtered.map((t) => (
              <Link
                key={t}
                href={`${baseHref}&tag=${encodeURIComponent(t)}`}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-surfaceMuted ${
                  activeTag === t ? "text-accent" : "text-slate"
                }`}
              >
                <span>{t}</span>
                {activeTag === t && <Check size={13} aria-hidden="true" />}
              </Link>
            ))}
            {filtered.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No matching tags.</p>}
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
