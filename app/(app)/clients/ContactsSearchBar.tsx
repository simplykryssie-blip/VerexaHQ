"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

export type FilterOption = { value: string; label: string };

// Free-text box (name/email/phone/tax-ID last 4/engagement number, all
// handled server-side by search_clients) plus a handful of dropdown/toggle
// chips for the facets that don't live on the clients table itself. Every
// control writes straight to the URL -- same pattern as the existing
// status/tag filters -- so the list stays server-rendered and a filtered
// view is always a shareable/bookmarkable link.
export function ContactsSearchBar({
  initialQuery,
  basePath,
  services,
  staffOptions,
  pipelineStages,
  activeServiceId,
  activeStaffId,
  activeStage,
  missingDocuments,
  outstandingBalance,
}: {
  initialQuery: string;
  basePath: string;
  services: FilterOption[];
  staffOptions: FilterOption[];
  pipelineStages: FilterOption[];
  activeServiceId: string;
  activeStaffId: string;
  activeStage: string;
  missingDocuments: boolean;
  outstandingBalance: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (query === initialQuery) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (query.trim()) params.set("q", query.trim());
      else params.delete("q");
      params.delete("page");
      router.push(`${basePath}?${params.toString()}`);
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function toggleLink(param: string, value: string) {
    const params = new URLSearchParams(window.location.search);
    if (params.get(param) === value) params.delete(param);
    else params.set(param, value);
    params.delete("page");
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone, tax ID last 4, or engagement #..."
          className="w-full rounded-lg border border-border py-1.5 pl-8 pr-8 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {services.length > 0 && (
        <FilterDropdown label="Service" options={services} activeValue={activeServiceId} param="service" basePath={basePath} />
      )}
      {staffOptions.length > 0 && (
        <FilterDropdown label="Assigned to" options={staffOptions} activeValue={activeStaffId} param="staff" basePath={basePath} />
      )}
      {pipelineStages.length > 0 && (
        <FilterDropdown label="Pipeline stage" options={pipelineStages} activeValue={activeStage} param="stage" basePath={basePath} />
      )}

      <Link
        href={toggleLink("missingDocs", "1")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
          missingDocuments ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
        }`}
      >
        Missing documents
      </Link>
      <Link
        href={toggleLink("balance", "1")}
        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
          outstandingBalance ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
        }`}
      >
        Outstanding balance
      </Link>
    </div>
  );
}

function FilterDropdown({
  label,
  options,
  activeValue,
  param,
  basePath,
}: {
  label: string;
  options: FilterOption[];
  activeValue: string;
  param: string;
  basePath: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useDropdownDismiss<HTMLDivElement>(open, () => setOpen(false));
  const activeLabel = options.find((o) => o.value === activeValue)?.label;

  function hrefFor(value: string) {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(param, value);
    else params.delete(param);
    params.delete("page");
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
          activeValue ? "border-accent text-accent" : "border-border text-slate hover:border-accent hover:text-accent"
        }`}
      >
        {activeLabel ?? label}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <DropdownPanel className="left-0 mt-1 w-56 p-1.5">
          <div className="max-h-64 overflow-y-auto">
            <Link
              href={hrefFor("")}
              onClick={() => setOpen(false)}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-surfaceMuted ${
                !activeValue ? "text-accent" : "text-slate"
              }`}
            >
              <span>All</span>
              {!activeValue && <Check size={13} aria-hidden="true" />}
            </Link>
            {options.map((o) => (
              <Link
                key={o.value}
                href={hrefFor(o.value)}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-surfaceMuted ${
                  activeValue === o.value ? "text-accent" : "text-slate"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {activeValue === o.value && <Check size={13} aria-hidden="true" className="shrink-0" />}
              </Link>
            ))}
          </div>
        </DropdownPanel>
      )}
    </div>
  );
}
