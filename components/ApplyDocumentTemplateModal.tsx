"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DateField from "@/components/DateField";
import type { Client, DocumentRequestTemplate } from "@/lib/types";

import { friendlyError } from "@/lib/friendlyError";
export default function ApplyDocumentTemplateModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<DocumentRequestTemplate[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .order("first_name")
        .then(({ data }) => setClients((data as Client[]) ?? []));
    }
    supabase
      .from("document_request_templates")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => {
        const list = (data as DocumentRequestTemplate[]) ?? [];
        setTemplates(list);
        if (list.length > 0) setTemplateId(list[0].id);
      });
  }, [clientId]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId || !templateId) {
      setError("Choose a client and a template.");
      return;
    }
    setSaving(true);
    setError(null);

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

    const { data, error } = await supabase.rpc("apply_document_request_template", {
      p_workspace_id: client.workspace_id,
      p_client_id: selectedClientId,
      p_template_id: templateId,
      p_service_id: null,
      p_document_year: null,
      p_due_date: dueDate || null,
    });

    setSaving(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    const created = (data as { created_count: number }).created_count;
    setResult(`Created ${created} document request${created === 1 ? "" : "s"}.`);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          Apply Document Request Template
        </h3>
        {result ? (
          <div className="space-y-3">
            <div className="text-sm text-green bg-green/10 border border-green/30 rounded-sm px-3 py-2">
              {result}
            </div>
            <button
              onClick={onClose}
              className="w-full text-sm font-semibold py-2 rounded-sm bg-ink text-white"
            >
              Done
            </button>
          </div>
        ) : (
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

            <select
              required
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              {templates.length === 0 && <option value="">No templates available</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_name}
                </option>
              ))}
            </select>

            <DateField value={dueDate} onChange={setDueDate} />
            <p className="text-xs text-muted">
              Optional due date for all items created from this template.
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
                disabled={saving || templates.length === 0}
                className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
              >
                {saving ? "Applying…" : "Apply Template"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
