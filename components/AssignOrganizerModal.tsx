"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, TaxOrganizerTemplate } from "@/lib/types";
import { organizerPrefillValue } from "@/lib/organizerPrefill";

export default function AssignOrganizerModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<TaxOrganizerTemplate[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) {
      supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .order("first_name")
        .then(({ data }) => setClients((data as Client[]) ?? []));
    }
    supabase
      .from("tax_organizer_templates")
      .select("*")
      .eq("is_active", true)
      .then(({ data }) => {
        const list = ((data as TaxOrganizerTemplate[]) ?? []).sort((a, b) =>
          (a.return_type ?? "").localeCompare(b.return_type ?? "") ||
          a.template_name.localeCompare(b.template_name)
        );
        setTemplates(list);
      });
  }, [clientId]);

  useEffect(() => {
    if (!selectedClientId || templates.length === 0) return;

    let cancelled = false;
    async function recommendTemplate() {
      const [{ data: client }, { data: taxYear }] = await Promise.all([
        supabase
          .from("clients")
          .select("client_type")
          .eq("id", selectedClientId)
          .maybeSingle(),
        supabase
          .from("client_tax_years")
          .select("return_type")
          .eq("client_id", selectedClientId)
          .order("tax_year", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const knownReturnType = taxYear?.return_type;
      const recommended = knownReturnType
        ? templates.find((template) => template.return_type === knownReturnType)
        : client?.client_type === "individual" || client?.client_type === "family"
          ? templates.find((template) => template.return_type === "1040")
          : undefined;
      setTemplateId(recommended?.id ?? "");
    }
    recommendTemplate();
    return () => {
      cancelled = true;
    };
  }, [selectedClientId, templates]);

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

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", selectedClientId)
      .maybeSingle();

    if (!client) {
      setError("Could not find that client's workspace.");
      setSaving(false);
      return;
    }

    const selectedTemplate = templates.find((template) => template.id === templateId);
    const taxYear = selectedTemplate?.tax_year ?? new Date().getFullYear() - 1;
    const returnType = selectedTemplate?.return_type ?? null;

    const { data: existingAssignment } = await supabase
      .from("tax_organizer_assignments")
      .select("id, assignment_status")
      .eq("client_id", selectedClientId)
      .eq("template_id", templateId)
      .in("assignment_status", ["draft", "sent", "in_progress", "submitted"])
      .maybeSingle();

    if (existingAssignment) {
      setError("This organizer is already assigned to this client. Open the existing organizer instead of creating duplicate work.");
      setSaving(false);
      return;
    }

    const { data: existingTaxYear } = await supabase
      .from("client_tax_years")
      .select("id")
      .eq("client_id", selectedClientId)
      .eq("tax_year", taxYear)
      .eq("return_type", returnType)
      .maybeSingle();

    let clientTaxYearId = existingTaxYear?.id ?? null;
    if (!clientTaxYearId) {
      const { data: createdTaxYear } = await supabase
        .from("client_tax_years")
        .insert({
          workspace_id: client.workspace_id,
          client_id: selectedClientId,
          tax_year: taxYear,
          return_type: returnType,
          tax_status: "not_started",
        })
        .select("id")
        .single();
      clientTaxYearId = createdTaxYear?.id ?? null;
    }

    const { data: assignment, error } = await supabase.from("tax_organizer_assignments").insert({
      workspace_id: client.workspace_id,
      client_id: selectedClientId,
      client_tax_year_id: clientTaxYearId,
      template_id: templateId,
      assignment_status: "draft",
      due_date: dueDate || null,
      created_by: userId,
    }).select().single();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }

    const { data: sectionRows } = await supabase
      .from("tax_organizer_sections")
      .select("id")
      .eq("template_id", templateId);
    const sectionIds = (sectionRows ?? []).map((section) => section.id);
    if (assignment && sectionIds.length > 0) {
      const { data: questionRows } = await supabase
        .from("tax_organizer_questions")
        .select("*")
        .in("section_id", sectionIds)
        .not("mapped_field", "is", null);
      const prefills = (questionRows ?? []).flatMap((question) => {
        const value = organizerPrefillValue(question, client as Client);
        return value === undefined ? [] : [{
          workspace_id: client.workspace_id,
          assignment_id: assignment.id,
          question_id: question.id,
          answer_value: value,
          answered_by: userId,
        }];
      });
      if (prefills.length > 0) await supabase.from("tax_organizer_answers").insert(prefills);
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Assign Tax Organizer</h3>
        <p className="text-sm text-muted mb-4">Known client details will be filled automatically. Financial amounts stay blank for the client or preparer to complete.</p>
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
            <option value="">
              {templates.length === 0 ? "No templates available" : "Select the return type…"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.template_name} ({t.return_type})
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            The return type is selected automatically when it is already known for this client. For a new business client, choose the entity return type once and VerexaHQ will reuse it next year.
          </p>

          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">Due date the client should submit by (optional).</p>

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
              {saving ? "Assigning…" : "Assign Organizer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
