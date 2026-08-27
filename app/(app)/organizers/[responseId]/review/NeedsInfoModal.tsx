"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";

export function NeedsInfoModal({
  fieldLabel,
  clientEmail,
  onClose,
  onSend,
}: {
  fieldLabel: string | null;
  clientEmail: string | null;
  onClose: () => void;
  onSend: (message: string, sendEmail: boolean, sendSms: boolean, showInPortal: boolean) => Promise<string | void>;
}) {
  const [message, setMessage] = useState("");
  const [sendEmail, setSendEmail] = useState(Boolean(clientEmail));
  const [sendSms, setSendSms] = useState(false);
  const [showInPortal, setShowInPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!message.trim()) {
      setError("A message is required.");
      return;
    }
    setSending(true);
    setError(null);
    const result = await onSend(message.trim(), sendEmail, sendSms, showInPortal);
    setSending(false);
    if (result) {
      setError(result);
      return;
    }
    onClose();
  }

  return (
    <Modal title={fieldLabel ? `Request info: ${fieldLabel}` : "Request information"} onClose={onClose}>
      <div className="space-y-3">
        <textarea
          autoFocus
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What do you need from the client?"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />

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

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
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
      </div>
    </Modal>
  );
}
