"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";

import { friendlyError } from "@/lib/friendlyError";
export default function UploadDocumentModal({
  clientId,
  workspaceId,
  onClose,
  onSaved,
}: {
  clientId?: string;
  workspaceId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(workspaceId ?? "");
  const [documentName, setDocumentName] = useState("");
  const [category, setCategory] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) return;
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type, workspace_id")
      .order("first_name")
      .then(({ data }) => setClients((data as (Client & { workspace_id: string })[]) ?? []));
  }, [clientId]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !selectedClientId) {
      setError("Choose a client and a file.");
      return;
    }
    setSaving(true);
    setError(null);

    let wsId = selectedWorkspaceId;
    if (!wsId) {
      const { data: client } = await supabase
        .from("clients")
        .select("workspace_id")
        .eq("id", selectedClientId)
        .maybeSingle();
      if (!client) {
        setError("Could not find that client's workspace.");
        setSaving(false);
        return;
      }
      wsId = client.workspace_id;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${wsId}/${selectedClientId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("verexahq-client-documents")
      .upload(path, file);

    if (uploadError) {
      setError(uploadError.message);
      setSaving(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { error } = await supabase.from("documents").insert({
      workspace_id: wsId,
      client_id: selectedClientId,
      document_name: documentName || file.name,
      document_category: category || null,
      document_status: "Received",
      received_date: new Date().toISOString().slice(0, 10),
      storage_bucket: "verexahq-client-documents",
      storage_path: path,
      original_file_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString(),
      is_visible_to_client: visibleToClient,
    });

    setSaving(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Upload Document</h3>
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
            placeholder="Document name (defaults to file name)"
            value={documentName}
            onChange={(e) => setDocumentName(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Category (e.g. W-2, Bank Statement, Engagement Letter)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            required
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={visibleToClient}
              onChange={(e) => setVisibleToClient(e.target.checked)}
              className="accent-[#0D1B2A]"
            />
            Visible to client in portal
          </label>

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
              {saving ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
