"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Search, ChevronDown } from "lucide-react";

export type StepPickerItem = {
  value: string;
  label: string;
  category: string;
  description?: string;
  keywords?: string;
};

export type StepPickerCategory = { key: string; label: string };

// Shared searchable/categorized picker for both trigger and action
// selection -- one component, fed different item/category lists, rather
// than a separate trigger picker and action picker. Category counts and
// search match name + description + category label + keywords.
export function StepPicker({
  items,
  categories,
  icon,
  onSelect,
  extraTopItem,
  autoFocus = true,
}: {
  items: StepPickerItem[];
  categories: StepPickerCategory[];
  icon: (value: string) => ReactNode;
  onSelect: (value: string) => void;
  extraTopItem?: { label: string; icon: ReactNode; description?: string; onSelect: () => void };
  autoFocus?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory && item.category !== activeCategory) return false;
      if (!q) return true;
      const categoryLabel = categories.find((c) => c.key === item.category)?.label ?? "";
      const haystack = `${item.label} ${item.description ?? ""} ${categoryLabel} ${item.keywords ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, categories, search, activeCategory]);

  const showExtraTop = Boolean(extraTopItem) && !search.trim() && !activeCategory;

  return (
    <div className="flex h-[420px] w-full overflow-hidden">
      <div className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-border bg-surfaceMuted py-2">
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          className={`flex items-center justify-between px-3 py-1.5 text-left text-xs font-medium ${
            activeCategory === null ? "bg-accentSoft text-accent" : "text-slate hover:bg-surface"
          }`}
        >
          All <span className="text-[10px] text-muted">{items.length}</span>
        </button>
        {categories
          .filter((c) => (countsByCategory[c.key] ?? 0) > 0)
          .map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCategory(c.key)}
              className={`flex items-center justify-between px-3 py-1.5 text-left text-xs font-medium ${
                activeCategory === c.key ? "bg-accentSoft text-accent" : "text-slate hover:bg-surface"
              }`}
            >
              <span className="truncate">{c.label}</span>
              <span className="ml-1 shrink-0 text-[10px] text-muted">{countsByCategory[c.key]}</span>
            </button>
          ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search size={14} className="shrink-0 text-muted" />
          <input
            autoFocus={autoFocus}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full border-none bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-1.5">
          {showExtraTop && extraTopItem && (
            <button
              type="button"
              onClick={extraTopItem.onSelect}
              className="mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-violetSoft"
            >
              <span className="mt-0.5 shrink-0">{extraTopItem.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{extraTopItem.label}</span>
                {extraTopItem.description && <span className="block text-[11px] text-muted">{extraTopItem.description}</span>}
              </span>
            </button>
          )}
          {filtered.length === 0 && !showExtraTop && <p className="px-2.5 py-4 text-center text-xs text-muted">No matches.</p>}
          {filtered.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onSelect(item.value)}
              className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-accentSoft"
            >
              <span className="mt-0.5 shrink-0 text-accent">{icon(item.value)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{item.label}</span>
                {item.description && <span className="block text-[11px] text-muted">{item.description}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// A collapsed button showing the current selection (icon + label), which
// toggles the categorized/searchable panel above open inline below it --
// used wherever a value needs picking from one of these lists outside of a
// canvas popover (e.g. a trigger or an existing step's action type, inside
// a form that already has room for it).
export function InlineStepPickerField({
  value,
  items,
  categories,
  icon,
  onChange,
  disabled,
}: {
  value: string;
  items: StepPickerItem[];
  categories: StepPickerCategory[];
  icon: (value: string) => ReactNode;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between rounded-lg border border-border px-2 py-1.5 text-left text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-accent">{icon(value)}</span>
          <span className="truncate">{selected?.label ?? value}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          <StepPicker
            items={items}
            categories={categories}
            icon={icon}
            autoFocus={false}
            onSelect={(v) => {
              setOpen(false);
              onChange(v);
            }}
          />
        </div>
      )}
    </div>
  );
}
