"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileText, Plus, Save, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendlyError";
import { mergeTemplate } from "@/lib/earlyAccess/mergeTemplate";

type FormTemplateRow = {
  id: string;
  workspace_id: string | null;
  template_name: string;
  template_category: string | null;
  description: string | null;
  content: string | null;
  is_active: boolean;
  is_platform_template: boolean;
  source_template_id: string | null;
  created_at: string;
  updated_at: string;
};

type AssignedFormRow = {
  id: string;
  assignment_status: string;
  clients: { first_name: string; last_name: string; business_name: string | null } | null;
  form_templates: { template_name: string } | null;
};

type ClientOption = { id: string; first_name: string; last_name: string; business_name: string | null; email: string | null };

const MERGE_FIELDS = ["firm_name", "firm_email", "firm_phone", "client_name", "client_email", "current_date"];
const KNOWN_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export default function FormsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { showSuccess, showError } = useToast();
  const [templates, setTemplates] = useState<FormTemplateRow[]>([]);
  const [assigned, setAssigned] = useState<AssignedFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<FormTemplateRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ template_name: string; template_category: string; description: string; content: string }>({
    template_name: "",
    template_category: "",
    description: "",
    content: "",
  });
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<FormTemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormTemplateRow | null>(null);

  const [firmContact, setFirmContact] = useState<{ name: string; email: string; phone: string }>({ name: "", email: "", phone: "" });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [previewClientId, setPreviewClientId] = useState("");

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const [t, a, ws, c] = await Promise.all([
      supabase
        .from("form_templates")
        .select("id,workspace_id,template_name,template_category,description,content,is_active,is_platform_template,source_template_id,created_at,updated_at")
        .or(`workspace_id.eq.${activeWorkspaceId},workspace_id.is.null`)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_form_assignments")
        .select("*,clients(first_name,last_name,business_name),form_templates(template_name)")
        .eq("workspace_id", activeWorkspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("workspace_settings")
        .select("business_legal_name,brand_name,business_email,business_phone")
        .eq("workspace_id", activeWorkspaceId)
        .maybeSingle(),
      supabase
        .from("clients")
        .select("id,first_name,last_name,business_name,email")
        .eq("workspace_id", activeWorkspaceId)
        .order("first_name")
        .limit(200),
    ]);
    setTemplates((t.data as FormTemplateRow[]) ?? []);
    setAssigned((a.data as unknown as AssignedFormRow[]) ?? []);
    const s = ws.data as { business_legal_name: string | null; brand_name: string | null; business_email: string | null; business_phone: string | null } | null;
    setFirmContact({
      name: s?.brand_name || s?.business_legal_name || "",
      email: s?.business_email || "",
      phone: s?.business_phone || "",
    });
    setClients((c.data as ClientOption[]) ?? []);
    setLoading(false);
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (statusFilter === "active" && !t.is_active) return false;
      if (statusFilter === "archived" && t.is_active) return false;
      if (!q) return true;
      return t.template_name.toLowerCase().includes(q) || (t.template_category ?? "").toLowerCase().includes(q);
    });
  }, [templates, search, statusFilter]);

  async function create() {
    if (!activeWorkspaceId || !name.trim()) return;
    setError(null);
    const { data, error: e } = await supabase.rpc("create_form_template", {
      p_workspace_id: activeWorkspaceId,
      p_template_name: name.trim(),
      p_template_category: null,
      p_description: null,
    });
    if (e || !data) {
      setError(friendlyError(e, "This template could not be created. Check your role and try again."));
      return;
    }
    setName("");
    setOpen(false);
    await load();
    const created = { id: data as string } as FormTemplateRow;
    void openDetail(created, true);
  }

  async function openDetail(template: FormTemplateRow, startEditing = false) {
    const { data } = await supabase
      .from("form_templates")
      .select("id,workspace_id,template_name,template_category,description,content,is_active,is_platform_template,source_template_id,created_at,updated_at")
      .eq("id", template.id)
      .maybeSingle();
    const row = (data as FormTemplateRow) ?? template;
    setSelected(row);
    setDraft({
      template_name: row.template_name,
      template_category: row.template_category ?? "",
      description: row.description ?? "",
      content: row.content ?? "",
    });
    setPreviewClientId("");
    setEditing(startEditing && !row.is_platform_template);
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    const { error: updateError } = await supabase
      .from("form_templates")
      .update({
        template_name: draft.template_name.trim() || selected.template_name,
        template_category: draft.template_category.trim() || null,
        description: draft.description.trim() || null,
        content: draft.content || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selected.id);
    setSaving(false);
    if (updateError) {
      showError(friendlyError(updateError, "Couldn't save this template."));
      return;
    }
    showSuccess("Template saved.");
    setEditing(false);
    await load();
    void openDetail(selected);
  }

  async function duplicate(template: FormTemplateRow) {
    if (!activeWorkspaceId) return;
    const { data, error: dupError } = await supabase
      .from("form_templates")
      .insert({
        workspace_id: activeWorkspaceId,
        template_name: `${template.template_name} (copy)`,
        template_category: template.template_category,
        description: template.description,
        content: template.content,
        is_active: true,
        is_platform_template: false,
        visibility_scope: "workspace",
        source_template_id: template.id,
      })
      .select("id")
      .single();
    if (dupError || !data) {
      showError(friendlyError(dupError, "Couldn't duplicate this template."));
      return;
    }
    showSuccess("Template duplicated. You can customize your copy.");
    await load();
    void openDetail({ ...template, id: data.id as string }, true);
  }

  async function toggleArchive(template: FormTemplateRow) {
    const { error: archiveError } = await supabase
      .from("form_templates")
      .update({ is_active: !template.is_active, updated_at: new Date().toISOString() })
      .eq("id", template.id);
    setArchiveTarget(null);
    if (archiveError) {
      showError(friendlyError(archiveError, "Couldn't update this template."));
      return;
    }
    showSuccess(template.is_active ? "Template archived." : "Template restored.");
    await load();
    if (selected?.id === template.id) void openDetail(template);
  }

  async function deleteTemplate(template: FormTemplateRow) {
    const { error: deleteError } = await supabase.from("form_templates").delete().eq("id", template.id);
    setDeleteTarget(null);
    if (deleteError) {
      showError(friendlyError(deleteError, "Couldn't delete this template."));
      return;
    }
    showSuccess("Template deleted.");
    if (selected?.id === template.id) setSelected(null);
    await load();
  }

  const unknownTokens = useMemo(() => {
    const found = new Set<string>();
    let m;
    const re = new RegExp(KNOWN_TOKEN_RE);
    while ((m = re.exec(draft.content))) {
      if (!MERGE_FIELDS.includes(m[1])) found.add(m[1]);
    }
    return Array.from(found);
  }, [draft.content]);

  const previewClient = clients.find((c) => c.id === previewClientId);
  const previewVars = {
    firm_name: firmContact.name || "Your firm",
    firm_email: firmContact.email || "firm@example.com",
    firm_phone: firmContact.phone || "(000) 000-0000",
    client_name: previewClient ? `${previewClient.business_name || `${previewClient.first_name} ${previewClient.last_name}`.trim()}` : "Sample Client",
    client_email: previewClient?.email || "client@example.com",
    current_date: new Date().toLocaleDateString(),
  };

  if (loading) return <p className="text-muted">Loading templates…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Forms & Templates</h1>
          <p className="mt-1 text-sm text-muted">
            Create reusable forms and review client assignments.
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="brand-gradient flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={17} />
          New template
        </button>
      </div>
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full rounded-xl border border-line py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "active" | "archived" | "all")}
          className="rounded-xl border border-line px-3 py-2.5 text-sm"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white">
          <div className="border-b border-line p-4 font-bold text-ink">
            Template library
          </div>
          {filtered.length === 0 ? (
            <Empty text="No templates match this filter." />
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => openDetail(t)}
                className="flex w-full items-center gap-3 border-b border-line p-4 text-left last:border-0 hover:bg-paper"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-[#108A64]">
                  <FileText size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-semibold text-ink">
                    {t.template_name}
                  </div>
                  <div className="text-xs text-muted">
                    {t.is_active ? "Active" : "Archived"}
                    {t.template_category ? ` · ${t.template_category}` : ""}
                  </div>
                </div>
                {t.is_platform_template && (
                  <span className="shrink-0 rounded-full bg-paper px-2 py-1 text-xs text-muted">
                    Verexa
                  </span>
                )}
              </button>
            ))
          )}
        </section>
        <section className="rounded-2xl border border-line bg-white">
          <div className="border-b border-line p-4 font-bold text-ink">
            Assigned forms
          </div>
          {assigned.length === 0 ? (
            <Empty text="No forms have been assigned." />
          ) : (
            assigned.map((a) => (
              <div
                key={a.id}
                className="border-b border-line p-4 last:border-0"
              >
                <div className="font-semibold text-ink">
                  {a.form_templates?.template_name || "Client form"}
                </div>
                <div className="mt-1 text-sm text-muted">
                  {a.clients?.business_name ||
                    `${a.clients?.first_name ?? ""} ${a.clients?.last_name ?? ""}`.trim()}{" "}
                  · {a.assignment_status}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-ink">New form template</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-4 w-full rounded-xl border border-line px-3 py-3"
              placeholder="Template name"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-line px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={create}
                className="rounded-xl bg-[#108A64] px-4 py-2 font-semibold text-white"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/30">
          <button aria-label="Close" className="absolute inset-0" onClick={() => setSelected(null)} tabIndex={-1} />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-line bg-white p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">{selected.template_name}</h2>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${selected.is_active ? "bg-emerald-50 text-emerald-700" : "bg-paper"}`}>
                    {selected.is_active ? "Active" : "Archived"}
                  </span>
                  {selected.is_platform_template && <span className="rounded-full bg-paper px-2 py-0.5">VerexaHQ system template</span>}
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            {selected.is_platform_template && (
              <p className="mt-3 rounded-xl border border-line bg-paper p-3 text-xs text-muted">
                This is a shared VerexaHQ system template. Duplicate it to create your own customizable copy — the original stays unchanged for every firm.
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {!selected.is_platform_template && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  Edit
                </button>
              )}
              <button
                onClick={() => duplicate(selected)}
                className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink"
              >
                <Copy size={13} /> Duplicate
              </button>
              {!selected.is_platform_template && (
                <>
                  <button
                    onClick={() => setArchiveTarget(selected)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink"
                  >
                    {selected.is_active ? "Archive" : "Restore"}
                  </button>
                  {!selected.is_active && (
                    <button
                      onClick={() => setDeleteTarget(selected)}
                      className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brick"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </>
              )}
            </div>

            {editing ? (
              <div className="mt-5 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Name</span>
                  <input className="w-full rounded-xl border border-line px-3 py-2 text-sm" value={draft.template_name} onChange={(e) => setDraft((d) => ({ ...d, template_name: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Category</span>
                  <input className="w-full rounded-xl border border-line px-3 py-2 text-sm" value={draft.template_category} onChange={(e) => setDraft((d) => ({ ...d, template_category: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Description</span>
                  <textarea className="w-full rounded-xl border border-line px-3 py-2 text-sm" rows={2} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Body</span>
                  <p className="mb-1.5 text-xs text-muted">
                    Merge fields: {MERGE_FIELDS.map((f) => `{{${f}}}`).join(", ")}
                  </p>
                  <textarea
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm font-mono"
                    rows={12}
                    value={draft.content}
                    onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                  />
                  {unknownTokens.length > 0 && (
                    <p className="mt-1 text-xs text-brick">
                      Unrecognized merge field{unknownTokens.length === 1 ? "" : "s"}: {unknownTokens.map((t) => `{{${t}}}`).join(", ")}
                    </p>
                  )}
                </label>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      setEditing(false);
                      void openDetail(selected);
                    }}
                    disabled={saving}
                    className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#108A64] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <Save size={15} /> {saving ? "Saving…" : "Save draft"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {selected.description && <p className="text-sm text-ink">{selected.description}</p>}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted">Preview</span>
                    <select
                      value={previewClientId}
                      onChange={(e) => setPreviewClientId(e.target.value)}
                      className="rounded-lg border border-line px-2 py-1 text-xs"
                    >
                      <option value="">Sample data</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.business_name || `${c.first_name} ${c.last_name}`.trim()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="whitespace-pre-wrap rounded-xl bg-paper p-4 text-sm text-ink">
                    {selected.content ? mergeTemplate(selected.content, previewVars) : <span className="text-muted">No body content yet.</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {archiveTarget && (
        <ConfirmDialog
          open
          title={`${archiveTarget.is_active ? "Archive" : "Restore"} "${archiveTarget.template_name}"?`}
          description={archiveTarget.is_active ? "It will be hidden from active templates but can be restored later." : "It will become available in your active templates again."}
          destructive={archiveTarget.is_active}
          confirmLabel={archiveTarget.is_active ? "Archive" : "Restore"}
          onConfirm={() => toggleArchive(archiveTarget)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Permanently delete "${deleteTarget.template_name}"?`}
          description="This cannot be undone."
          destructive
          confirmLabel="Delete"
          onConfirm={() => deleteTemplate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted">{text}</div>;
}
