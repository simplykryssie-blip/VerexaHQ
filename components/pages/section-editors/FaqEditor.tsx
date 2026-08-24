import { Plus, Trash2 } from "lucide-react";

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type FaqItem = { question: string; answer: string };
type FaqConfig = { items?: FaqItem[] };

export function FaqEditor({ config, onChange }: { config: FaqConfig; onChange: (patch: Partial<FaqConfig>) => void }) {
  const items = config.items ?? [];

  function updateItem(i: number, patch: Partial<FaqItem>) {
    onChange({ items: items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)) });
  }
  function removeItem(i: number) {
    onChange({ items: items.filter((_, idx) => idx !== i) });
  }
  function addItem() {
    onChange({ items: [...items, { question: "", answer: "" }] });
  }

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Question {i + 1}</p>
            <button type="button" onClick={() => removeItem(i)} className="rounded p-0.5 text-muted hover:text-danger" aria-label="Remove question">
              <Trash2 size={13} />
            </button>
          </div>
          <input value={item.question} onChange={(e) => updateItem(i, { question: e.target.value })} placeholder="Question" className={inputClass} />
          <textarea value={item.answer} onChange={(e) => updateItem(i, { answer: e.target.value })} placeholder="Answer" rows={2} className={`${inputClass} mt-2`} />
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
      >
        <Plus size={13} /> Add question
      </button>
    </div>
  );
}
