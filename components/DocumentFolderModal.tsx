"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DocumentFolderTemplate, DocumentFolder } from "@/lib/types";

export default function DocumentFolderModal({
  clientId,
  workspaceId,
  onClose,
  onSaved,
}: {
  clientId: string;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"template" | "manual">("template");
  const [templates, setTemplates] = useState<DocumentFolderTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [folderName, setFolderName] = useState("");
  const [existingFolders, setExistingFolders] = useState<DocumentFolder[]>([]);
  const [parentFolderId, setParentFolderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("document_folder_templates")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => {
        const list = (data as DocumentFolderTemplate[]) ?? [];
        setTemplates(list);
        if (list.length > 0) setTemplateId(list[0].id);
      });
    supabase
      .from("document_folders")
      .select("*")
      .eq("client_id", clientId)
      .then(({ data }) => setExistingFolders((data as DocumentFolder[]) ?? []));
  }, [clientId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (mode === "template") {
      if (!templateId) {
        setError("Choose a template.");
        setSaving(false);
        return;
      }
      const { error } = await supabase.rpc("apply_document_folder_template", {
        p_workspace_id: workspaceId,
        p_client_id: clientId,
        p_template_id: templateId,
        p_service_id: null,
      });
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.rpc("create_document_folder", {
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_service_id: null,
      p_parent_folder_id: parentFolderId || null,
      p_folder_name: folderName,
      p_folder_type: "Client",
      p_is_visible_to_client: true,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Add Folders</h3>

        <div className="flex mb-4 border border-line rounded-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("template")}
            className="flex-1 text-xs font-semibold py-2"
            style={{
              backgroundColor: mode === "template" ? "#0D1B2A" : "white",
              color: mode === "template" ? "white" : "#0D1B2A",
            }}
          >
            From Template
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className="flex-1 text-xs font-semibold py-2"
            style={{
              backgroundColor: mode === "manual" ? "#0D1B2A" : "white",
              color: mode === "manual" ? "white" : "#0D1B2A",
            }}
          >
            Single Folder
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "template" ? (
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
          ) : (
            <>
              <input
                required
                placeholder="Folder name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
              {existingFolders.length > 0 && (
                <select
                  value={parentFolderId}
                  onChange={(e) => setParentFolderId(e.target.value)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                >
                  <option value="">Top level (no parent)</option>
                  {existingFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      Inside &quot;{f.folder_name}&quot;
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

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
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
