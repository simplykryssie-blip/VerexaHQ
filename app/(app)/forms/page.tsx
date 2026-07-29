"use client";
import { useCallback, useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { friendlyError } from "@/lib/friendlyError";

type FormTemplateRow = {
  id: string;
  template_name: string;
  is_active: boolean;
  is_system_template: boolean;
};

type AssignedFormRow = {
  id: string;
  assignment_status: string;
  clients: { first_name: string; last_name: string; business_name: string | null } | null;
  form_templates: { template_name: string } | null;
};

export default function FormsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [templates, setTemplates] = useState<FormTemplateRow[]>([]);
  const [assigned, setAssigned] = useState<AssignedFormRow[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const [t, a] = await Promise.all([
      supabase
        .from("form_templates")
        .select("*")
        .or(`workspace_id.eq.${activeWorkspaceId},workspace_id.is.null`)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_form_assignments")
        .select(
          "*,clients(first_name,last_name,business_name),form_templates(template_name)",
        )
        .eq("workspace_id", activeWorkspaceId)
        .order("created_at", { ascending: false }),
    ]);
    setTemplates((t.data as FormTemplateRow[]) ?? []);
    setAssigned((a.data as unknown as AssignedFormRow[]) ?? []);
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    if (!activeWorkspaceId || !name.trim()) return;
    setError(null);
    const { error: e } = await supabase.rpc("create_form_template", {
      p_workspace_id: activeWorkspaceId,
      p_template_name: name.trim(),
      p_template_category: null,
      p_description: null,
    });
    if (e) {
      setError(friendlyError(e, "This template could not be created. Check your role and try again."));
      return;
    }
    setName("");
    setOpen(false);
    void load();
  }
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
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white">
          <div className="border-b border-line p-4 font-bold text-ink">
            Template library
          </div>
          {templates.length === 0 ? (
            <Empty text="No form templates yet." />
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 border-b border-line p-4 last:border-0"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-[#108A64]">
                  <FileText size={18} />
                </span>
                <div className="flex-1">
                  <div className="font-semibold text-ink">
                    {t.template_name}
                  </div>
                  <div className="text-xs text-muted">
                    {t.is_active ? "Active" : "Inactive"}
                  </div>
                </div>
                {t.is_system_template && (
                  <span className="rounded-full bg-paper px-2 py-1 text-xs text-muted">
                    Verexa
                  </span>
                )}
              </div>
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
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted">{text}</div>;
}
