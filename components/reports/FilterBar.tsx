"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Trash2 } from "lucide-react";
import { listSavedFilters, saveFilter, deleteSavedFilter } from "@/lib/reports/savedFilters";

export function FilterBar({
  reportKey,
  showDateRange = true,
  searchPlaceholder = "Search...",
}: {
  reportKey: string;
  showDateRange?: boolean;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState(() => listSavedFilters(reportKey));

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function applyQuery(query: string) {
    router.replace(`${pathname}?${query}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface shadow-soft p-4">
      <div className="flex-1 min-w-[180px]">
        <label className="block text-xs font-medium text-muted" htmlFor="report-search">
          Search
        </label>
        <input
          id="report-search"
          type="search"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder={searchPlaceholder}
          onChange={(e) => updateParam("q", e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {showDateRange && (
        <>
          <div>
            <label className="block text-xs font-medium text-muted" htmlFor="report-from">
              From
            </label>
            <input
              id="report-from"
              type="date"
              defaultValue={searchParams.get("from") ?? ""}
              onChange={(e) => updateParam("from", e.target.value)}
              className="mt-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted" htmlFor="report-to">
              To
            </label>
            <input
              id="report-to"
              type="date"
              defaultValue={searchParams.get("to") ?? ""}
              onChange={(e) => updateParam("to", e.target.value)}
              className="mt-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </>
      )}

      <div className="flex items-end gap-2">
        <select
          aria-label="Saved filters"
          onChange={(e) => e.target.value && applyQuery(e.target.value)}
          defaultValue=""
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">Saved filters...</option>
          {saved.map((f) => (
            <option key={f.name} value={f.query}>
              {f.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Save as..."
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          className="w-28 rounded-lg border border-border px-2 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          disabled={!saveName}
          onClick={() => {
            setSaved(saveFilter(reportKey, saveName, searchParams.toString()));
            setSaveName("");
          }}
          aria-label="Save current filters"
          className="rounded-lg border border-border p-2 text-muted hover:border-accent hover:text-accent disabled:opacity-40"
        >
          <Bookmark size={14} />
        </button>
        {saved.length > 0 && (
          <button
            type="button"
            onClick={() => setSaved(deleteSavedFilter(reportKey, saved[saved.length - 1].name))}
            aria-label="Delete most recently saved filter"
            className="rounded-lg border border-border p-2 text-muted hover:border-danger hover:text-danger"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
