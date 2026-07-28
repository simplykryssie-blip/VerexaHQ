"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import { sendEmail, getProviderStatus } from "@/lib/notify";

import { friendlyError } from "@/lib/friendlyError";
export default function RequestDocumentModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [documentName, setDocumentName] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailConfigured, setEmailConfigured] = useState(false);

  useEffect(() => {
    if (clientId) return;
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type")
      .order("first_name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, [clientId]);

  useEffect(() => {
    getProviderStatus().then((s) => setEmailConfigured(s.email));
  }, []);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) {
      setError("Choose a client.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error } = await supabase.rpc("request_client_document", {
      p_client_id: selectedClientId,
      p_document_name: documentName,
      p_document_category: category || null,
      p_service_id: null,
      p_client_message: message || null,
    });

    setSaving(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }

    if (emailConfigured) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("email, first_name")
        .eq("id", selectedClientId)
        .maybeSingle();
      if (clientRow?.email) {
        sendEmail(
          clientRow.email,
          `Document needed: ${documentName}`,
          `<p>Hi ${clientRow.first_name || ""},</p>
           <p>We need the following from you: <strong>${documentName}</strong></p>
           ${message ? `<p>${message}</p>` : ""}
           <p>Please log in to your client portal to upload it.</p>`
        );
      }
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Request a Document</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!clientId && (
            <select
              required
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientLabel(c)}
                </option>
              ))}
            </select>
          )}

          <input
            required
            placeholder="What do you need? (e.g. 2025 W-2)"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Note to client (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            This adds a to-do in the client&apos;s portal so they can upload it
            themselves{emailConfigured ? ", and emails them a heads-up." : "."}
          </p>

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
            >
              {saving ? "Sending…" : "Request Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
