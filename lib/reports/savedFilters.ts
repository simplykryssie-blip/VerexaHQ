"use client";

/**
 * Saved filters, scoped to this browser (localStorage) rather than a new
 * workspace-shared table -- there's no existing "saved views" concept in
 * the schema to reuse, and a personal, per-browser preset list is real,
 * working functionality without adding schema surface for something no
 * report yet needs shared across a team.
 */
export type SavedFilter = { name: string; query: string };

function storageKey(reportKey: string) {
  return `verexa_saved_filters_${reportKey}`;
}

export function listSavedFilters(reportKey: string): SavedFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(reportKey));
    return raw ? (JSON.parse(raw) as SavedFilter[]) : [];
  } catch {
    return [];
  }
}

export function saveFilter(reportKey: string, name: string, query: string) {
  const existing = listSavedFilters(reportKey).filter((f) => f.name !== name);
  const next = [...existing, { name, query }];
  window.localStorage.setItem(storageKey(reportKey), JSON.stringify(next));
  return next;
}

export function deleteSavedFilter(reportKey: string, name: string) {
  const next = listSavedFilters(reportKey).filter((f) => f.name !== name);
  window.localStorage.setItem(storageKey(reportKey), JSON.stringify(next));
  return next;
}
