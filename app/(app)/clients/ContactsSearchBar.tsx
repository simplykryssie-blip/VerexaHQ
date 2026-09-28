"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Check, ChevronDown, X, Filter } from "lucide-react";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";
import { TagFilterControl } from "./TagFilterControl";

export type FilterOption = { value: string; label: string };

// Free-text box (name/email/phone/tax-ID last 4/engagement number, all
// handled server-side by search_clients) plus a single "Filters" popover
// housing every secondary facet that doesn't live on the clients table
// itself (Contacts UI Condensation audit -- these used to render as a
// permanent, wrapping row of ~9-11 controls). Every control still writes
// straight to the URL -- same pattern as the existing status filter -- so
// the list stays server-rendered and a filtered view is always a
// shareable/bookmarkable link; only where these controls render changed.
export function ContactsSearchBar({
  initialQuery,
  basePath,
  services,
  staffOptions,
  pipelineStages,
  activeServiceId,
  activeStaffId,
  activeStage,
  clientTypes,
  activeClientType,
  hasEmail,
  hasPhone,
  tags,
  activeTag,
  tagQueryBase,
}: {
  initialQuery: string;
  basePath: string;
  services: FilterOption[];
  staffOptions: FilterOption[];
  pipelineStages: FilterOption[];
  activeServiceId: string;
  activeStaffId: string;
  activeStage: string;
  clientTypes: FilterOption[];
  activeClientType: string;
  /** Only ever set to `false` ("No email") from this component's own UI --
   * `true` is still accepted since search_clients' own p_has_email predates
   * this UI and a bookmarked/typed ?hasEmail=1 link must keep working, but
   * nothing in the Filters popover offers a way to set it anymore (Contacts
   * Filter Streamlining: the list already shows email/phone per row, so a
   * positive "Has email" filter is redundant -- only the negative one finds
   * something you can't already see at a glance). */
  hasEmail: boolean | undefined;
  hasPhone: boolean | undefined;
  /** Workspace's tag catalog for the Filters popover's Tag entry -- same
   * data page.tsx already fetches via get_workspace_tags, just routed here
   * instead of TagFilterControl rendering as its own standalone row. */
  tags: string[];
  activeTag: string;
  /** Same tag-exclusive query string page.tsx already builds for
   * TagFilterControl's own links (every active filter except `tag`),
   * unchanged. */
  tagQueryBase: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useDropdownDismiss<HTMLDivElement>(filtersOpen, () => setFiltersOpen(false));

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

  // Counts distinct filter facets, not individual toggle buttons. The
  // free-text search box and status tabs are never part of this count.
  const activeFilterCount =
    (activeServiceId ? 1 : 0) +
    (activeStaffId ? 1 : 0) +
    (activeStage ? 1 : 0) +
    (activeClientType ? 1 : 0) +
    (hasEmail === undefined ? 0 : 1) +
    (hasPhone === undefined ? 0 : 1) +
    (activeTag ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      <div ref={filtersRef} className="relative">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            activeFilterCount > 0 ? "border-accent text-accent" : "border-border text-slate hover:border-accent hover:text-accent"
          }`}
        >
          <Filter size={13} aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {filtersOpen && (
          <DropdownPanel className="right-0 mt-1 w-72 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                {services.length > 0 && (
                  <FilterDropdown label="Service" options={services} activeValue={activeServiceId} param="service" basePath={basePath} />
                )}
                {staffOptions.length > 0 && (
                  <FilterDropdown label="Assigned to" options={staffOptions} activeValue={activeStaffId} param="staff" basePath={basePath} />
                )}
                {pipelineStages.length > 0 && (
                  <FilterDropdown label="Pipeline stage" options={pipelineStages} activeValue={activeStage} param="stage" basePath={basePath} />
                )}
                <FilterDropdown label="Type" options={clientTypes} activeValue={activeClientType} param="clientType" basePath={basePath} />
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Missing contact info</span>
                <div className="flex flex-wrap gap-1.5">
                  <ToggleChip href={toggleLink("hasEmail", "0")} active={hasEmail === false} label="No email" />
                  <ToggleChip href={toggleLink("hasPhone", "0")} active={hasPhone === false} label="No phone" />
                </div>
              </div>

              {tags.length > 0 && (
                <div className="border-t border-border pt-3">
                  <TagFilterControl tags={tags} activeTag={activeTag} baseHref={tagQueryBase} />
                </div>
              )}
            </div>
          </DropdownPanel>
        )}
      </div>
    </div>
  );
}

function ToggleChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? "bg-accent text-white" : "bg-surfaceMuted text-slate hover:bg-border"
      }`}
    >
      {label}
    </Link>
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
