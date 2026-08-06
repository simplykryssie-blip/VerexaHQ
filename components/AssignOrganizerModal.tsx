"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import type { Client, OrganizerTemplate } from "@/lib/types";

import { friendlyError } from "@/lib/friendlyError";

type EngagementOption = { id: string; label: string };

export default function AssignOrganizerModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { activeWorkspaceId } = useWorkspace();
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<OrganizerTemplate[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [engagements, setEngagements] = useState<EngagementOption[]>([]);
  const [engagementId, setEngagementId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (!clientId) {
      supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .eq("workspace_id", activeWorkspaceId)
        .order("first_name")
        .then(({ data }) => setClients((data as Client[]) ?? []));
    }
    supabase
      .from("organizer_templates")
      .select("*")
      .eq("status", "published")
      .or(`workspace_id.is.null,workspace_id.eq.${activeWorkspaceId}`)
      .order("name")
      .then(({ data }) => setTemplates((data as OrganizerTemplate[]) ?? []));
  }, [clientId, activeWorkspaceId]);

  useEffect(() => {
    setEngagementId("");
    if (!selectedClientId) {
      setEngagements([]);
      return;
    }
    supabase
      .from("engagements")
      .select("id, engagement_number, service:services(name)")
      .eq("client_id", selectedClientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = (data as unknown as { id: string; engagement_number: string | null; service: { name: string } | null }[]) ?? [];
        setEngagements(
          list.map((e) => ({
            id: e.id,
            label: e.service?.name ? `${e.service.name}${e.engagement_number ? ` (${e.engagement_number})` : ""}` : e.engagement_number || "Engagement",
          })),
        );
      });
  }, [selectedClientId]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name ? c.business_name : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeWorkspaceId || !selectedClientId || !templateId) {
      setError("Choose a client and a template.");
      return;
    }
    setSaving(true);
    setError(null);

    const { data: existingResponse } = await supabase
      .from("organizer_responses")
      .select("id")
      .eq("client_id", selectedClientId)
      .eq("organizer_template_id", templateId)
      .in("status", ["not_started", "in_progress", "submitted"])
      .maybeSingle();

    if (existingResponse) {
      setError("This organizer is already assigned to this client. Open the existing organizer instead of creating duplicate work.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("organizer_responses").insert({
      workspace_id: activeWorkspaceId,
      client_id: selectedClientId,
      engagement_id: engagementId || null,
      organizer_template_id: templateId,
      status: "not_started",
    });

    setSaving(false);
    if (insertError) {
      setError(friendlyError(insertError, "Something went wrong. Please try again."));
      return;
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Assign Tax Organizer</h3>
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
            <option value="">{templates.length === 0 ? "No templates available" : "Select an organizer…"}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {selectedClientId && engagements.length > 0 && (
            <select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} className="w-full border border-line rounded-sm px-3 py-2 text-sm">
              <option value="">No linked engagement</option>
              {engagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          )}

          {error && <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || templates.length === 0}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
            >
              {saving ? "Assigning…" : "Assign Organizer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
