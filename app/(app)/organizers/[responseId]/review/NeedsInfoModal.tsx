"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/Modal";

export type DraftItem = { id: string; organizer_field_id: string; instance_index: number; note: string; label: string };

function buildMessage(intro: string, items: DraftItem[]): string {
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
// "compile what I've already flagged into one message, add a due date and
// tags, and send" step, not where flagging itself happens. Removing an item
// here actually unflags it on the server, keeping one source of truth.
export function NeedsInfoModal({
  items,
  clientEmail,
  onClose,
  onRemove,
  onSend,
}: {
  items: DraftItem[];
  clientEmail: string | null;
  onClose: () => void;
  onRemove: (itemId: string) => void;
  onSend: (message: string, dueDate: string | null, tags: string[], sendEmail: boolean, sendSms: boolean, showInPortal: boolean) => Promise<string | void>;
}) {
  const [intro, setIntro] = useState("We need a bit more information before we can finish reviewing your organizer:");
  const [dueDate, setDueDate] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [sendEmail, setSendEmail] = useState(Boolean(clientEmail));
  const [sendSms, setSendSms] = useState(false);
  const [showInPortal, setShowInPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const preview = buildMessage(intro, items);
  const tags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  async function handleSend() {
    if (items.length === 0) {
      setError("Flag at least one question before sending.");
      return;
    }
    setSending(true);
    setError(null);
    const result = await onSend(preview, dueDate || null, tags, sendEmail, sendSms, showInPortal);
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
                Nothing flagged yet -- close this and flag questions from the review cards first.
              </p>
            ) : (
              <ul className="mt-1 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                {items.map((item) => (
                  <li key={item.id} className="rounded-lg bg-surfaceMuted p-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.label}`} className="shrink-0 text-muted hover:text-danger">
                        <X size={13} />
                      </button>
                    </div>
                    {item.note && <p className="mt-1 text-xs text-slate">{item.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-slate">Due date (optional)</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate">Tags (comma separated)</span>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="urgent, 1099"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </label>
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
