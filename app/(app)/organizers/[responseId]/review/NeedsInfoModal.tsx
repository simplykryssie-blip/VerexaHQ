"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Modal } from "@/components/Modal";

export type NeedsInfoItem = { key: string; label: string; note: string };

function buildMessage(intro: string, items: NeedsInfoItem[]): string {
  const lines: string[] = [];
  if (intro.trim()) lines.push(intro.trim());
  if (items.length > 0) {
    if (lines.length > 0) lines.push("");
    items.forEach((item, i) => {
      lines.push(item.note.trim() ? `${i + 1}. ${item.label} -- ${item.note.trim()}` : `${i + 1}. ${item.label}`);
    });
  }
  return lines.join("\n");
}

// Pre-populated from whatever the reviewer already flagged on individual
// question cards while going through the organizer (saved immediately at
// flag time, not held in this component's own state) -- this is purely the
// "compile what I've already saved into one message and send it" step, not
// where selection happens. An extra free-form item covers an ask that isn't
// tied to any single question (e.g. "please also send your driver's
// license").
export function NeedsInfoModal({
  items: initialItems,
  clientEmail,
  onClose,
  onSend,
}: {
  items: NeedsInfoItem[];
  clientEmail: string | null;
  onClose: () => void;
  onSend: (message: string, sendEmail: boolean, sendSms: boolean, showInPortal: boolean) => Promise<string | void>;
}) {
  const [intro, setIntro] = useState("We need a bit more information before we can finish reviewing your organizer:");
  const [items, setItems] = useState(initialItems);
  const [extraLabel, setExtraLabel] = useState("");
  const [sendEmail, setSendEmail] = useState(Boolean(clientEmail));
  const [sendSms, setSendSms] = useState(false);
  const [showInPortal, setShowInPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const preview = buildMessage(intro, items);

  function updateNote(key: string, note: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, note } : it)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }

  function addExtraItem() {
    if (!extraLabel.trim()) return;
    setItems((prev) => [...prev, { key: `extra-${Date.now()}`, label: extraLabel.trim(), note: "" }]);
    setExtraLabel("");
  }

  async function handleSend() {
    if (items.length === 0 && !intro.trim()) {
      setError("Flag at least one question, add an item, or write a message.");
      return;
    }
    setSending(true);
    setError(null);
    const result = await onSend(preview, sendEmail, sendSms, showInPortal);
    setSending(false);
    if (result) {
      setError(result);
      return;
    }
    onClose();
  }

  return (
    <Modal title="Send information request" onClose={onClose} size="xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0 space-y-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate">Message intro</span>
            <textarea
              rows={2}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <div>
            <span className="block text-xs font-medium text-slate">What&apos;s needed</span>
            {items.length === 0 ? (
              <p className="mt-1 rounded-lg border border-dashed border-border p-3 text-xs text-muted">
                Nothing flagged yet -- go back and flag questions that need more info, or add an item below.
              </p>
            ) : (
              <ul className="mt-1 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                {items.map((item) => (
                  <li key={item.key} className="rounded-lg bg-surfaceMuted p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      <button type="button" onClick={() => removeItem(item.key)} aria-label={`Remove ${item.label}`} className="shrink-0 text-muted hover:text-danger">
                        <X size={13} />
                      </button>
                    </div>
                    <input
                      value={item.note}
                      onChange={(e) => updateNote(item.key, e.target.value)}
                      placeholder="What's needed for this one? (optional)"
                      className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                value={extraLabel}
                onChange={(e) => setExtraLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addExtraItem();
                  }
                }}
                placeholder="Add something not tied to a specific question..."
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={addExtraItem}
                disabled={!extraLabel.trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-40"
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} disabled={!clientEmail} />
              Send email {!clientEmail && <span className="text-xs text-muted">(no email on file)</span>}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} />
              Send SMS
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showInPortal} onChange={(e) => setShowInPortal(e.target.checked)} />
              Show in client portal
            </label>
          </div>
        </div>

        <div className="min-w-0">
          <span className="block text-xs font-medium text-slate">Preview -- exactly what the client will see</span>
          <div className="mt-1 h-full whitespace-pre-wrap rounded-lg border border-border bg-surfaceMuted p-3 text-sm text-ink">
            {preview || <span className="text-muted">Nothing to send yet.</span>}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send to client"}
        </button>
      </div>
    </Modal>
  );
}
