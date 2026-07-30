"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileSignature, FileText, ListChecks, Mail, Plus, Save, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useToast } from "@/components/Toast";
import ConfirmDialog from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/friendlyError";
import { mergeTemplate } from "@/lib/earlyAccess/mergeTemplate";

type Category = "intake_forms" | "questionnaires" | "documents" | "engagement_letters" | "emails";

const CATEGORIES: { key: Category; label: string; icon: typeof FileText }[] = [
  { key: "intake_forms", label: "Intake Forms", icon: ListChecks },
  { key: "questionnaires", label: "Questionnaires", icon: ListChecks },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "engagement_letters", label: "Engagement Letters", icon: FileSignature },
  { key: "emails", label: "Emails", icon: Mail },
];

type FormItem = {
  kind: "form";
  id: string;
  workspace_id: string | null;
  template_name: string;
  template_category: string | null;
  description: string | null;
  is_active: boolean;
  is_platform_template: boolean;
};
type OrganizerItem = {
  kind: "tax_organizer";
  id: string;
  workspace_id: string | null;
  template_name: string;
  tax_year: number | null;
  return_type: string | null;
  is_active: boolean;
  is_platform_template: boolean;
};
type DocumentItem = {
  kind: "document";
  id: string;
  workspace_id: string | null;
  template_name: string;
  document_type: string | null;
  is_active: boolean;
  is_platform_template: boolean;
};
type LetterItem = {
  kind: "engagement_letter";
  id: string;
  workspace_id: string | null;
  template_name: string;
  service_type: string | null;
  is_active: boolean;
  is_platform_template: boolean;
};
type EmailItem = {
  kind: "email";
  id: string;
  workspace_id: string;
  template_name: string;
  template_type: string | null;
  is_active: boolean;
};
type AnyItem = FormItem | OrganizerItem | DocumentItem | LetterItem | EmailItem;

type FormQuestion = {
  id: string;
  question_label: string;
  question_help: string | null;
  question_type: string;
  is_required: boolean;
  options: string[] | null;
  conditional_logic: Record<string, unknown> | null;
  sort_order: number;
};
type OrganizerQuestion = {
  id: string;
  question_text: string;
  help_text: string | null;
  question_type: string;
  is_required: boolean;
  options: string[] | null;
  conditional_logic: Record<string, unknown> | null;
  explanation: string | null;
  example_text: string | null;
  sort_order: number;
};
type OrganizerSection = {
  id: string;
  section_title: string;
  section_description: string | null;
  sort_order: number;
  questions: OrganizerQuestion[];
};

type AssignedFormRow = {
  id: string;
  assignment_status: string;
  clients: { first_name: string; last_name: string; business_name: string | null } | null;
  form_templates: { template_name: string } | null;
};
type ClientOption = { id: string; first_name: string; last_name: string; business_name: string | null; email: string | null };

const MERGE_FIELDS = ["firm_name", "firm_email", "firm_phone", "client_name", "client_email", "current_date", "tax_year"];
const KNOWN_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function summarizeConditionalLogic(logic: Record<string, unknown> | null | undefined): string | null {
  if (!logic || Object.keys(logic).length === 0) return null;
  const field = typeof logic.mapped_field === "string" ? logic.mapped_field : null;
  if (field && "equals" in logic) return `Shown when "${field}" = ${String(logic.equals)}`;
  if (field && Array.isArray(logic.in)) return `Shown when "${field}" is one of: ${logic.in.join(", ")}`;
  return `Conditional: ${JSON.stringify(logic)}`;
}

export default function FormsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { showSuccess, showError } = useToast();

  const [category, setCategory] = useState<Category>("intake_forms");
  const [forms, setForms] = useState<FormItem[]>([]);
  const [organizers, setOrganizers] = useState<OrganizerItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [letters, setLetters] = useState<LetterItem[]>([]);
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [assigned, setAssigned] = useState<AssignedFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");
  const [canManage, setCanManage] = useState(false);
  const [canWrite, setCanWrite] = useState(false);

  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedRef, setSelectedRef] = useState<{ kind: AnyItem["kind"]; id: string } | null>(null);
  const [detail, setDetail] = useState<{
    name: string;
    description: string | null;
    isPlatform: boolean;
    isActive: boolean;
    body: string | null;
    subject: string | null;
    formQuestions: FormQuestion[] | null;
    organizerSections: OrganizerSection[] | null;
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", category: "", subject: "", description: "", body: "" });
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ kind: AnyItem["kind"]; id: string; name: string; isActive: boolean } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: AnyItem["kind"]; id: string; name: string } | null>(null);

  const [firmContact, setFirmContact] = useState<{ name: string; email: string; phone: string }>({ name: "", email: "", phone: "" });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [previewClientId, setPreviewClientId] = useState("");

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const [f, o, d, l, e, a, ws, c, manage, write] = await Promise.all([
      supabase
        .from("form_templates")
        .select("id,workspace_id,template_name,template_category,description,is_active,is_platform_template")
        .or(`workspace_id.eq.${activeWorkspaceId},workspace_id.is.null`)
        .order("template_name"),
      supabase
        .from("tax_organizer_templates")
        .select("id,workspace_id,template_name,tax_year,return_type,is_active,is_platform_template")
        .or(`workspace_id.eq.${activeWorkspaceId},workspace_id.is.null`)
        .order("template_name"),
      supabase
        .from("document_templates")
        .select("id,workspace_id,template_name,document_type,is_active,is_platform_template")
        .or(`workspace_id.eq.${activeWorkspaceId},workspace_id.is.null`)
        .order("template_name"),
      supabase
        .from("engagement_letter_templates")
        .select("id,workspace_id,template_name,service_type,is_active,is_platform_template")
        .or(`workspace_id.eq.${activeWorkspaceId},workspace_id.is.null`)
        .order("template_name"),
      supabase
        .from("email_templates")
        .select("id,workspace_id,template_name,template_type,is_active")
        .eq("workspace_id", activeWorkspaceId)
        .order("template_name"),
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
      supabase.rpc("workspace_can_manage_templates", { p_workspace_id: activeWorkspaceId }),
      supabase.rpc("can_staff_write", { p_workspace_id: activeWorkspaceId }),
    ]);
    setForms(((f.data as Omit<FormItem, "kind">[]) ?? []).map((r) => ({ kind: "form", ...r })));
    setOrganizers(((o.data as Omit<OrganizerItem, "kind">[]) ?? []).map((r) => ({ kind: "tax_organizer", ...r })));
    setDocuments(((d.data as Omit<DocumentItem, "kind">[]) ?? []).map((r) => ({ kind: "document", ...r })));
    setLetters(((l.data as Omit<LetterItem, "kind">[]) ?? []).map((r) => ({ kind: "engagement_letter", ...r })));
    setEmails(((e.data as Omit<EmailItem, "kind">[]) ?? []).map((r) => ({ kind: "email", ...r })));
    setAssigned((a.data as unknown as AssignedFormRow[]) ?? []);
    const s = ws.data as { business_legal_name: string | null; brand_name: string | null; business_email: string | null; business_phone: string | null } | null;
    setFirmContact({
      name: s?.brand_name || s?.business_legal_name || "",
      email: s?.business_email || "",
      phone: s?.business_phone || "",
    });
    setClients((c.data as ClientOption[]) ?? []);
    setCanManage(manage.data === true);
    setCanWrite(write.data === true);
    setLoading(false);
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);

  const listForCategory: AnyItem[] = useMemo(() => {
    switch (category) {
      case "intake_forms":
        return forms;
      case "questionnaires":
        return organizers;
      case "documents":
        return documents;
      case "engagement_letters":
        return letters;
      case "emails":
        return emails;
    }
  }, [category, forms, organizers, documents, letters, emails]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listForCategory.filter((t) => {
      if (statusFilter === "active" && !t.is_active) return false;
      if (statusFilter === "archived" && t.is_active) return false;
      if (!q) return true;
      return t.template_name.toLowerCase().includes(q);
    });
  }, [listForCategory, search, statusFilter]);

  async function createNew() {
    if (!activeWorkspaceId || !name.trim()) return;
    setError(null);
    if (category === "intake_forms") {
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
      void openDetail("form", data as string, true);
    } else if (category === "emails") {
      const { data, error: e } = await supabase.rpc("create_email_template", {
        p_workspace_id: activeWorkspaceId,
        p_template_name: name.trim(),
        p_template_type: null,
        p_subject: "",
        p_body: "",
      });
      if (e || !data) {
        setError(friendlyError(e, "This template could not be created. Check your role and try again."));
        return;
      }
      setName("");
      setOpen(false);
      await load();
      void openDetail("email", data as string, true);
    } else if (category === "engagement_letters") {
      const { data, error: e } = await supabase
        .from("engagement_letter_templates")
        .insert({ workspace_id: activeWorkspaceId, template_name: name.trim(), template_body: "", is_active: true, is_platform_template: false, visibility_scope: "workspace" })
        .select("id")
        .single();
      if (e || !data) {
        setError(friendlyError(e, "This template could not be created. Check your role and try again."));
        return;
      }
      setName("");
      setOpen(false);
      await load();
      void openDetail("engagement_letter", data.id as string, true);
    } else if (category === "documents") {
      const { data, error: e } = await supabase
        .from("document_templates")
        .insert({ workspace_id: activeWorkspaceId, template_name: name.trim(), template_body: "", is_active: true, is_platform_template: false, visibility_scope: "workspace" })
        .select("id")
        .single();
      if (e || !data) {
        setError(friendlyError(e, "This template could not be created. Check your role and try again."));
        return;
      }
      setName("");
      setOpen(false);
      await load();
      void openDetail("document", data.id as string, true);
    } else {
      setError("Questionnaires are built from a Verexa system template. Duplicate one to create your own.");
    }
  }

  async function openDetail(kind: AnyItem["kind"], id: string, startEditing = false) {
    setSelectedRef({ kind, id });
    setDetailLoading(true);
    setPreviewClientId("");
    setEditing(false);

    if (kind === "form") {
      const [{ data: row }, { data: questions }] = await Promise.all([
        supabase.from("form_templates").select("id,template_name,template_category,description,is_active,is_platform_template,content").eq("id", id).maybeSingle(),
        supabase
          .from("form_questions")
          .select("id,question_label,question_help,question_type,is_required,options,conditional_logic,sort_order")
          .eq("template_id", id)
          .order("sort_order"),
      ]);
      if (!row) {
        setDetailLoading(false);
        return;
      }
      setDetail({
        name: row.template_name,
        description: row.description,
        isPlatform: row.is_platform_template,
        isActive: row.is_active,
        body: row.content,
        subject: null,
        formQuestions: (questions as FormQuestion[]) ?? [],
        organizerSections: null,
      });
      setDraft({ name: row.template_name, category: row.template_category ?? "", subject: "", description: row.description ?? "", body: row.content ?? "" });
      setEditing(startEditing && !row.is_platform_template);
    } else if (kind === "tax_organizer") {
      const [{ data: row }, { data: sections }] = await Promise.all([
        supabase.from("tax_organizer_templates").select("id,template_name,tax_year,return_type,is_active,is_platform_template").eq("id", id).maybeSingle(),
        supabase.from("tax_organizer_sections").select("id,section_title,section_description,sort_order").eq("template_id", id).order("sort_order"),
      ]);
      if (!row) {
        setDetailLoading(false);
        return;
      }
      const sectionIds = (sections ?? []).map((s: { id: string }) => s.id);
      const { data: questions } =
        sectionIds.length > 0
          ? await supabase
              .from("tax_organizer_questions")
              .select("id,section_id,question_text,help_text,question_type,is_required,options,conditional_logic,explanation,example_text,sort_order")
              .in("section_id", sectionIds)
          : { data: [] as never[] };
      const grouped: OrganizerSection[] = (sections ?? []).map((s: { id: string; section_title: string; section_description: string | null; sort_order: number }) => ({
        id: s.id,
        section_title: s.section_title,
        section_description: s.section_description,
        sort_order: s.sort_order,
        questions: ((questions ?? []) as (OrganizerQuestion & { section_id: string })[])
          .filter((q) => q.section_id === s.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      }));
      setDetail({
        name: row.template_name,
        description: [row.return_type, row.tax_year ? String(row.tax_year) : null].filter(Boolean).join(" · ") || null,
        isPlatform: row.is_platform_template,
        isActive: row.is_active,
        body: null,
        subject: null,
        formQuestions: null,
        organizerSections: grouped,
      });
      setDraft({ name: row.template_name, category: row.return_type ?? "", subject: "", description: row.tax_year ? String(row.tax_year) : "", body: "" });
      setEditing(false);
    } else if (kind === "document") {
      const { data: row } = await supabase.from("document_templates").select("id,template_name,document_type,is_active,is_platform_template,template_body").eq("id", id).maybeSingle();
      if (!row) {
        setDetailLoading(false);
        return;
      }
      setDetail({ name: row.template_name, description: row.document_type, isPlatform: row.is_platform_template, isActive: row.is_active, body: row.template_body, subject: null, formQuestions: null, organizerSections: null });
      setDraft({ name: row.template_name, category: row.document_type ?? "", subject: "", description: "", body: row.template_body ?? "" });
      setEditing(startEditing && !row.is_platform_template);
    } else if (kind === "engagement_letter") {
      const { data: row } = await supabase.from("engagement_letter_templates").select("id,template_name,service_type,is_active,is_platform_template,template_body").eq("id", id).maybeSingle();
      if (!row) {
        setDetailLoading(false);
        return;
      }
      setDetail({ name: row.template_name, description: row.service_type, isPlatform: row.is_platform_template, isActive: row.is_active, body: row.template_body, subject: null, formQuestions: null, organizerSections: null });
      setDraft({ name: row.template_name, category: row.service_type ?? "", subject: "", description: "", body: row.template_body ?? "" });
      setEditing(startEditing && !row.is_platform_template);
    } else {
      const { data: row } = await supabase.from("email_templates").select("id,template_name,template_type,is_active,subject,body").eq("id", id).maybeSingle();
      if (!row) {
        setDetailLoading(false);
        return;
      }
      setDetail({ name: row.template_name, description: row.template_type, isPlatform: false, isActive: row.is_active, body: row.body, subject: row.subject, formQuestions: null, organizerSections: null });
      setDraft({ name: row.template_name, category: row.template_type ?? "", subject: row.subject ?? "", description: "", body: row.body ?? "" });
      setEditing(startEditing);
    }
    setDetailLoading(false);
  }

  async function saveEdit() {
    if (!selectedRef) return;
    setSaving(true);
    let saveError: { message: string } | null = null;
    if (selectedRef.kind === "form") {
      const { error: e } = await supabase
        .from("form_templates")
        .update({ template_name: draft.name.trim() || undefined, template_category: draft.category.trim() || null, description: draft.description.trim() || null, content: draft.body || null, updated_at: new Date().toISOString() })
        .eq("id", selectedRef.id);
      saveError = e;
    } else if (selectedRef.kind === "document") {
      const { error: e } = await supabase
        .from("document_templates")
        .update({ template_name: draft.name.trim() || undefined, document_type: draft.category.trim() || null, template_body: draft.body || null, updated_at: new Date().toISOString() })
        .eq("id", selectedRef.id);
      saveError = e;
    } else if (selectedRef.kind === "engagement_letter") {
      const { error: e } = await supabase
        .from("engagement_letter_templates")
        .update({ template_name: draft.name.trim() || undefined, service_type: draft.category.trim() || null, template_body: draft.body || null, updated_at: new Date().toISOString() })
        .eq("id", selectedRef.id);
      saveError = e;
    } else if (selectedRef.kind === "email") {
      const { error: e } = await supabase
        .from("email_templates")
        .update({ template_name: draft.name.trim() || undefined, template_type: draft.category.trim() || null, subject: draft.subject || null, body: draft.body || null, updated_at: new Date().toISOString() })
        .eq("id", selectedRef.id);
      saveError = e;
    }
    setSaving(false);
    if (saveError) {
      showError(friendlyError(saveError, "Couldn't save this template."));
      return;
    }
    showSuccess("Template saved.");
    setEditing(false);
    await load();
    void openDetail(selectedRef.kind, selectedRef.id);
  }

  async function duplicateItem(kind: AnyItem["kind"], id: string, currentName: string) {
    if (!activeWorkspaceId) return;
    setDuplicating(true);
    try {
      if (kind === "form") {
        const { data, error: e } = await supabase.rpc("duplicate_form_template", { p_source_template_id: id, p_workspace_id: activeWorkspaceId });
        if (e || !data) throw e ?? new Error("Duplicate failed.");
        showSuccess("Form duplicated. You can customize your copy.");
        await load();
        void openDetail("form", data as string, true);
      } else if (kind === "tax_organizer") {
        const { data, error: e } = await supabase.rpc("duplicate_tax_organizer_template", { p_source_template_id: id, p_workspace_id: activeWorkspaceId });
        if (e || !data) throw e ?? new Error("Duplicate failed.");
        showSuccess("Questionnaire duplicated. You can customize your copy.");
        await load();
        void openDetail("tax_organizer", data as string, true);
      } else if (kind === "document") {
        const { data: source } = await supabase.from("document_templates").select("template_name,document_type,template_body,merge_fields").eq("id", id).maybeSingle();
        const { data, error: e } = await supabase
          .from("document_templates")
          .insert({ workspace_id: activeWorkspaceId, template_name: `${source?.template_name ?? currentName} (copy)`, document_type: source?.document_type, template_body: source?.template_body, merge_fields: source?.merge_fields, is_active: true, is_platform_template: false, visibility_scope: "workspace" })
          .select("id")
          .single();
        if (e || !data) throw e ?? new Error("Duplicate failed.");
        showSuccess("Document duplicated. You can customize your copy.");
        await load();
        void openDetail("document", data.id as string, true);
      } else if (kind === "engagement_letter") {
        const { data: source } = await supabase.from("engagement_letter_templates").select("template_name,service_type,template_body,merge_fields,allowed_signature_methods").eq("id", id).maybeSingle();
        const { data, error: e } = await supabase
          .from("engagement_letter_templates")
          .insert({ workspace_id: activeWorkspaceId, template_name: `${source?.template_name ?? currentName} (copy)`, service_type: source?.service_type, template_body: source?.template_body, merge_fields: source?.merge_fields, allowed_signature_methods: source?.allowed_signature_methods, is_active: true, is_platform_template: false, visibility_scope: "workspace" })
          .select("id")
          .single();
        if (e || !data) throw e ?? new Error("Duplicate failed.");
        showSuccess("Engagement letter duplicated. You can customize your copy.");
        await load();
        void openDetail("engagement_letter", data.id as string, true);
      } else {
        const { data: source } = await supabase.from("email_templates").select("template_name,template_type,subject,body").eq("id", id).maybeSingle();
        const { data, error: e } = await supabase
          .from("email_templates")
          .insert({ workspace_id: activeWorkspaceId, template_name: `${source?.template_name ?? currentName} (copy)`, template_type: source?.template_type, subject: source?.subject, body: source?.body, is_active: true })
          .select("id")
          .single();
        if (e || !data) throw e ?? new Error("Duplicate failed.");
        showSuccess("Email template duplicated. You can customize your copy.");
        await load();
        void openDetail("email", data.id as string, true);
      }
    } catch (e) {
      showError(friendlyError(e as { message: string; code?: string }, "Couldn't duplicate this template."));
    } finally {
      setDuplicating(false);
    }
  }

  async function toggleArchive(target: { kind: AnyItem["kind"]; id: string; isActive: boolean }) {
    const table = { form: "form_templates", tax_organizer: "tax_organizer_templates", document: "document_templates", engagement_letter: "engagement_letter_templates", email: "email_templates" }[target.kind];
    const { error: e } = await supabase.from(table).update({ is_active: !target.isActive, updated_at: new Date().toISOString() }).eq("id", target.id);
    setArchiveTarget(null);
    if (e) {
      showError(friendlyError(e, "Couldn't update this template."));
      return;
    }
    showSuccess(target.isActive ? "Template archived." : "Template restored.");
    await load();
    if (selectedRef?.id === target.id) void openDetail(target.kind, target.id);
  }

  async function deleteItem(target: { kind: AnyItem["kind"]; id: string }) {
    const table = { form: "form_templates", tax_organizer: "tax_organizer_templates", document: "document_templates", engagement_letter: "engagement_letter_templates", email: "email_templates" }[target.kind];
    const { error: e } = await supabase.from(table).delete().eq("id", target.id);
    setDeleteTarget(null);
    if (e) {
      showError(friendlyError(e, "Couldn't delete this template."));
      return;
    }
    showSuccess("Template deleted.");
    if (selectedRef?.id === target.id) setSelectedRef(null);
    await load();
  }

  const unknownTokens = useMemo(() => {
    const found = new Set<string>();
    let m;
    const re = new RegExp(KNOWN_TOKEN_RE);
    const text = `${draft.subject} ${draft.body}`;
    while ((m = re.exec(text))) {
      if (!MERGE_FIELDS.includes(m[1])) found.add(m[1]);
    }
    return Array.from(found);
  }, [draft.body, draft.subject]);

  const previewClient = clients.find((c) => c.id === previewClientId);
  const previewVars = {
    firm_name: firmContact.name || "Your firm",
    firm_email: firmContact.email || "firm@example.com",
    firm_phone: firmContact.phone || "(000) 000-0000",
    client_name: previewClient ? `${previewClient.business_name || `${previewClient.first_name} ${previewClient.last_name}`.trim()}` : "Sample Client",
    client_email: previewClient?.email || "client@example.com",
    current_date: new Date().toLocaleDateString(),
    tax_year: String(new Date().getFullYear() - 1),
  };

  if (loading) return <p className="text-muted">Loading templates…</p>;

  const structured = detail && (detail.formQuestions !== null || detail.organizerSections !== null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Templates</h1>
          <p className="mt-1 text-sm text-muted">
            Intake forms, questionnaires, documents, engagement letters, and emails — VerexaHQ system templates plus your firm&apos;s own.
          </p>
        </div>
        {canManage && category !== "questionnaires" && (
          <button onClick={() => setOpen(true)} className="brand-gradient flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white">
            <Plus size={17} />
            New template
          </button>
        )}
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-5 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => {
              setCategory(c.key);
              setSelectedRef(null);
              setDetail(null);
            }}
            className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold ${category === c.key ? "border-[#108A64] bg-emerald-50 text-[#108A64]" : "border-line bg-white text-muted"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="w-full rounded-xl border border-line py-2.5 pl-9 pr-3 text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "active" | "archived" | "all")} className="rounded-xl border border-line px-3 py-2.5 text-sm">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white">
          <div className="border-b border-line p-4 font-bold text-ink">Template library</div>
          {filtered.length === 0 ? (
            <Empty text="No templates match this filter." />
          ) : (
            filtered.map((t) => (
              <button key={t.id} onClick={() => openDetail(t.kind, t.id)} className="flex w-full items-center gap-3 border-b border-line p-4 text-left last:border-0 hover:bg-paper">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-[#108A64]">
                  <FileText size={18} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-semibold text-ink">{t.template_name}</div>
                  <div className="text-xs text-muted">{t.is_active ? "Active" : "Archived"}</div>
                </div>
                {"is_platform_template" in t && t.is_platform_template && <span className="shrink-0 rounded-full bg-paper px-2 py-1 text-xs text-muted">Verexa</span>}
              </button>
            ))
          )}
        </section>
        <section className="rounded-2xl border border-line bg-white">
          <div className="border-b border-line p-4 font-bold text-ink">Assigned forms</div>
          {assigned.length === 0 ? (
            <Empty text="No forms have been assigned." />
          ) : (
            assigned.map((a) => (
              <div key={a.id} className="border-b border-line p-4 last:border-0">
                <div className="font-semibold text-ink">{a.form_templates?.template_name || "Client form"}</div>
                <div className="mt-1 text-sm text-muted">
                  {a.clients?.business_name || `${a.clients?.first_name ?? ""} ${a.clients?.last_name ?? ""}`.trim()} · {a.assignment_status}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-ink">New {CATEGORIES.find((c) => c.key === category)?.label.toLowerCase().replace(/s$/, "")}</h2>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-4 w-full rounded-xl border border-line px-3 py-3" placeholder="Template name" />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-xl border border-line px-4 py-2">
                Cancel
              </button>
              <button onClick={createNew} className="rounded-xl bg-[#108A64] px-4 py-2 font-semibold text-white">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRef && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/30">
          <button aria-label="Close" className="absolute inset-0" onClick={() => setSelectedRef(null)} tabIndex={-1} />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-line bg-white p-6">
            {detailLoading || !detail ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink">{detail.name}</h2>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${detail.isActive ? "bg-emerald-50 text-emerald-700" : "bg-paper"}`}>{detail.isActive ? "Active" : "Archived"}</span>
                      {detail.isPlatform && <span className="rounded-full bg-paper px-2 py-0.5">VerexaHQ system template</span>}
                    </div>
                  </div>
                  <button onClick={() => setSelectedRef(null)} className="text-muted hover:text-ink">
                    <X size={18} />
                  </button>
                </div>

                {detail.isPlatform && (
                  <p className="mt-3 rounded-xl border border-line bg-paper p-3 text-xs text-muted">
                    This is a shared VerexaHQ system template and stays read-only for every firm. Duplicate it to create your own customizable copy.
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {canManage && !detail.isPlatform && !editing && !structured && (
                    <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                      Edit
                    </button>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => selectedRef && duplicateItem(selectedRef.kind, selectedRef.id, detail.name)}
                      disabled={duplicating}
                      className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
                    >
                      <Copy size={13} /> Duplicate
                    </button>
                  )}
                  {canManage && !detail.isPlatform && selectedRef && (
                    <>
                      <button onClick={() => setArchiveTarget({ kind: selectedRef.kind, id: selectedRef.id, name: detail.name, isActive: detail.isActive })} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink">
                        {detail.isActive ? "Archive" : "Restore"}
                      </button>
                      {!detail.isActive && (
                        <button onClick={() => setDeleteTarget({ kind: selectedRef.kind, id: selectedRef.id, name: detail.name })} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brick">
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
                      <input className="w-full rounded-xl border border-line px-3 py-2 text-sm" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                    </label>
                    {selectedRef?.kind === "email" && (
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Subject</span>
                        <input className="w-full rounded-xl border border-line px-3 py-2 text-sm" value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} />
                      </label>
                    )}
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted">Body</span>
                      <p className="mb-1.5 text-xs text-muted">Merge fields: {MERGE_FIELDS.map((f) => `{{${f}}}`).join(", ")}</p>
                      <textarea className="w-full rounded-xl border border-line px-3 py-2 text-sm font-mono" rows={12} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
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
                          if (selectedRef) void openDetail(selectedRef.kind, selectedRef.id);
                        }}
                        disabled={saving}
                        className="flex-1 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button onClick={saveEdit} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#108A64] py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                        <Save size={15} /> {saving ? "Saving…" : "Save draft"}
                      </button>
                    </div>
                  </div>
                ) : structured ? (
                  <div className="mt-5">
                    {detail.description && <p className="text-sm text-ink">{detail.description}</p>}
                    <StructuredPreview detail={detail} />
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    {detail.description && <p className="text-sm text-ink">{detail.description}</p>}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted">Preview</span>
                        <select value={previewClientId} onChange={(e) => setPreviewClientId(e.target.value)} className="rounded-lg border border-line px-2 py-1 text-xs">
                          <option value="">Sample data</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.business_name || `${c.first_name} ${c.last_name}`.trim()}
                            </option>
                          ))}
                        </select>
                      </div>
                      {detail.subject !== null && (
                        <div className="mb-2 rounded-xl bg-paper p-3 text-sm font-semibold text-ink">{detail.subject ? mergeTemplate(detail.subject, previewVars) : <span className="font-normal text-muted">No subject yet.</span>}</div>
                      )}
                      <div className="whitespace-pre-wrap rounded-xl bg-paper p-4 text-sm text-ink">
                        {detail.body ? mergeTemplate(detail.body, previewVars) : <span className="text-muted">No body content yet.</span>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {archiveTarget && (
        <ConfirmDialog
          open
          title={`${archiveTarget.isActive ? "Archive" : "Restore"} "${archiveTarget.name}"?`}
          description={archiveTarget.isActive ? "It will be hidden from active templates but can be restored later." : "It will become available in your active templates again."}
          destructive={archiveTarget.isActive}
          confirmLabel={archiveTarget.isActive ? "Archive" : "Restore"}
          onConfirm={() => toggleArchive(archiveTarget)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          open
          title={`Permanently delete "${deleteTarget.name}"?`}
          description="This cannot be undone."
          destructive
          confirmLabel="Delete"
          onConfirm={() => deleteItem(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function StructuredPreview({
  detail,
}: {
  detail: { formQuestions: FormQuestion[] | null; organizerSections: OrganizerSection[] | null };
}) {
  if (detail.organizerSections) {
    if (detail.organizerSections.length === 0) return <Empty text="This questionnaire has no sections yet." />;
    return (
      <div className="mt-4 space-y-5">
        {detail.organizerSections.map((s) => (
          <div key={s.id} className="rounded-xl border border-line p-4">
            <div className="font-bold text-ink">{s.section_title}</div>
            {s.section_description && <p className="mt-1 text-sm text-muted">{s.section_description}</p>}
            <div className="mt-3 space-y-3">
              {s.questions.map((q) => (
                <QuestionRow
                  key={q.id}
                  label={q.question_text}
                  help={[q.help_text, q.example_text ? `Example: ${q.example_text}` : null].filter(Boolean).join(" ")}
                  type={q.question_type}
                  required={q.is_required}
                  options={q.options}
                  conditionSummary={summarizeConditionalLogic(q.conditional_logic)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const questions = detail.formQuestions ?? [];
  if (questions.length === 0) return <Empty text="This form has no questions yet." />;
  return (
    <div className="mt-4 space-y-3">
      {questions.map((q) => (
        <QuestionRow key={q.id} label={q.question_label} help={q.question_help} type={q.question_type} required={q.is_required} options={q.options} conditionSummary={summarizeConditionalLogic(q.conditional_logic)} />
      ))}
    </div>
  );
}

function QuestionRow({
  label,
  help,
  type,
  required,
  options,
  conditionSummary,
}: {
  label: string;
  help: string | null | undefined;
  type: string;
  required: boolean;
  options: string[] | null;
  conditionSummary: string | null;
}) {
  return (
    <div className="rounded-lg bg-paper p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="font-semibold text-ink">{label}</div>
        <div className="flex shrink-0 gap-1.5">
          <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{type}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${required ? "bg-amber-50 text-amber-700" : "bg-white text-muted border border-line"}`}>{required ? "Required" : "Optional"}</span>
        </div>
      </div>
      {help && <p className="mt-1 text-xs text-muted">{help}</p>}
      {options && options.length > 0 && <p className="mt-1 text-xs text-ink">Options: {options.join(", ")}</p>}
      {conditionSummary && <p className="mt-1 text-xs italic text-muted">{conditionSummary}</p>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted">{text}</div>;
}
