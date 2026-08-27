"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";

export type NeedsInfoSection = { id: string; label: string; questions: { key: string; label: string }[] };

function buildMessage(intro: string, items: { label: string; note: string }[]): string {
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

// One combined message per "Needs Info" send, covering everything the
// reviewer flags across the whole organizer -- replaces the earlier
// per-question flow that fired a separate client notification for every
// item marked "needs info," which was the actual complaint this redesign
// responds to. Selection + notes + the exact outgoing text all live in one
// place instead of being scattered across each question's own controls.
export function NeedsInfoModal({
  sections,
  clientEmail,
  onClose,
  onSend,
}: {
  sections: NeedsInfoSection[];
  clientEmail: string | null;
  onClose: () => void;
  onSend: (message: string, sendEmail: boolean, sendSms: boolean, showInPortal: boolean) => Promise<string | void>;
}) {
  const [intro, setIntro] = useState("We need a bit more information before we can finish reviewing your organizer:");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [sendEmail, setSendEmail] = useState(Boolean(clientEmail));
  const [sendSms, setSendSms] = useState(false);
  const [showInPortal, setShowInPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const labelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections) for (const q of s.questions) map.set(q.key, q.label);
    return map;
  }, [sections]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      else next[key] = "";
      return next;
    });
  }

  const selectedItems = Object.entries(selected).map(([key, note]) => ({ label: labelByKey.get(key) ?? key, note }));
  const preview = buildMessage(intro, selectedItems);

  async function handleSend() {
    if (selectedItems.length === 0 && !intro.trim()) {
      setError("Select at least one question or add a message.");
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
    <Modal title="Request information from client" onClose={onClose} size="xl">
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
            <span className="block text-xs font-medium text-slate">What do you need?</span>
            <div className="mt-1 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-border p-2">
              {sections.map((s) => (
                <div key={s.id}>
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{s.label}</p>
                  <div className="mt-1 space-y-1">
                    {s.questions.map((q) => {
                      const isSelected = q.key in selected;
                      return (
                        <div key={q.key} className="rounded-lg px-1 py-1">
                          <label className="flex items-start gap-2 text-sm text-slate">
                            <input type="checkbox" checked={isSelected} onChange={() => toggle(q.key)} className="mt-0.5 h-3.5 w-3.5 rounded border-border" />
                            {q.label}
                          </label>
                          {isSelected && (
                            <input
                              value={selected[q.key]}
                              onChange={(e) => setSelected((prev) => ({ ...prev, [q.key]: e.target.value }))}
                              placeholder="What's needed for this one? (optional)"
                              className="ml-5 mt-1 w-[calc(100%-1.25rem)] rounded-lg border border-border bg-surface px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {sections.length === 0 && <p className="p-2 text-xs text-muted">No questions to select from.</p>}
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
