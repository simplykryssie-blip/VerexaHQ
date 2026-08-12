"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Item = { id: string; name: string; category: string | null; is_required: boolean };

export function DocumentRequestTemplatePreview({ templateId, templateName }: { templateId: string; templateName: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);

  async function load() {
    setOpen(true);
    if (items) return;
    setLoading(true);
    const { data } = await supabase
      .from("document_request_items")
      .select("id, name, category, is_required")
      .eq("document_request_template_id", templateId)
      .order("display_order");
    setItems(data ?? []);
    setLoading(false);
  }

  const grouped = (items ?? []).reduce<Record<string, Item[]>>((acc, item) => {
    const key = item.category ?? "Other";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <>
      <button type="button" onClick={load} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline" aria-label="Preview document request">
        <Eye size={12} /> Preview
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{templateName}</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-ink" aria-label="Close preview">
                <X size={16} />
              </button>
            </div>
            {loading ? (
              <p className="mt-3 text-sm text-muted">Loading...</p>
            ) : !items || items.length === 0 ? (
              <p className="mt-3 text-sm text-muted">This template has no document items yet.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {Object.entries(grouped).map(([category, categoryItems]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{category}</p>
                    <ul className="mt-1.5 space-y-1">
                      {categoryItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-1.5 text-sm text-slate">
                          {item.name}
                          {item.is_required && <span className="text-[10px] font-semibold uppercase text-warning">Required</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
