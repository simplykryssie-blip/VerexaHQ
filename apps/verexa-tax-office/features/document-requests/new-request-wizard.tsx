"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import type { RequestItemInput } from "@/lib/validation/document-requests";

type Category = { id: string; name: string };
type RequestTemplate = { id: string; title: string; template_id: string };

const BLANK_ITEM: RequestItemInput = {
  categoryId: null,
  documentLabel: "",
  customLabel: null,
  description: null,
  isRequired: true,
  minimumFiles: 1,
  maximumFiles: null,
  taxYear: null,
};

export function NewDocumentRequestWizard({
  workspaceId,
  clients,
  staff,
  categories,
  templates,
  fixedClientId,
  fixedEngagementId,
}: {
  workspaceId: string;
  clients: PickerOption[];
  staff: PickerOption[];
  categories: Category[];
  templates: RequestTemplate[];
  fixedClientId?: string;
  fixedEngagementId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [title, setTitle] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [items, setItems] = useState<RequestItemInput[]>([{ ...BLANK_ITEM }]);
  const [sendNow, setSendNow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function applyTemplate(requestTemplateId: string) {
    const { data: templateItems } = await supabase
      .from("document_request_template_items")
      .select("*")
      .eq("request_template_id", requestTemplateId)
      .order("sort_order");
    if (!templateItems || templateItems.length === 0) return;
    setItems(
      templateItems.map((ti) => ({
        categoryId: ti.category_id,
        documentLabel: ti.document_label,
        customLabel: ti.custom_label,
        description: ti.description,
        isRequired: ti.is_required,
        minimumFiles: ti.minimum_files,
        maximumFiles: ti.maximum_files,
        taxYear: null,
      })),
    );
    const template = templates.find((t) => t.id === requestTemplateId);
    if (template && !title) setTitle(template.title);
  }

  function updateItem(index: number, patch: Partial<RequestItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Choose a client.");
      return;
    }
    if (!title.trim()) {
      setError("Enter a title for this request.");
      return;
    }
    if (items.length === 0 || items.some((i) => !i.documentLabel.trim())) {
      setError("Every requested item needs a label.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: request, error: reqError } = await supabase
      .from("document_requests")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        engagement_id: fixedEngagementId ?? null,
        title: title.trim(),
        client_message: clientMessage || null,
        internal_notes: internalNotes || null,
        due_date: dueDate || null,
        assigned_to_user_id: assignedTo,
        created_by: user?.id ?? null,
        status: sendNow ? "sent" : "draft",
        sent_at: sendNow ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (reqError || !request) {
      setError(friendlyDbError(reqError?.message));
      setSubmitting(false);
      return;
    }

    const { error: itemsError } = await supabase.from("document_request_items").insert(
      items.map((it, idx) => ({
        request_id: request.id,
        workspace_id: workspaceId,
        category_id: it.categoryId,
        document_label: it.documentLabel,
        custom_label: it.customLabel,
        description: it.description,
        is_required: it.isRequired,
        minimum_files: it.minimumFiles,
        maximum_files: it.maximumFiles,
        tax_year: it.taxYear,
        sort_order: idx,
      })),
    );

    setSubmitting(false);
    if (itemsError) {
      setError(friendlyDbError(itemsError.message));
      return;
    }

    toast.success(sendNow ? "Document request sent" : "Document request saved as draft");
    router.push(`/document-requests/${request.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Request details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!fixedClientId && (
            <div className="space-y-1">
              <Label>Client *</Label>
              <SearchablePicker options={clients} value={clientId} onChange={setClientId} placeholder="Search clients…" />
            </div>
          )}
          {templates.length > 0 && (
            <div className="space-y-1">
              <Label>Start from a template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template, or build a blank request below" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="2025 W-2s and 1099s" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Assign to staff</Label>
              <SearchablePicker options={staff} value={assignedTo} onChange={setAssignedTo} placeholder="Staff member…" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Message to client</Label>
            <Textarea value={clientMessage} onChange={(e) => setClientMessage(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Internal notes</Label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Requested items</CardTitle>
          <Button type="button" size="sm" variant="outline" onClick={() => setItems((prev) => [...prev, { ...BLANK_ITEM }])}>
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                {items.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Label *</Label>
                  <Input value={item.documentLabel} onChange={(e) => updateItem(idx, { documentLabel: e.target.value })} placeholder="W-2 from employer" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={item.categoryId ?? "none"} onValueChange={(v) => updateItem(idx, { categoryId: v === "none" ? null : v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea value={item.description ?? ""} onChange={(e) => updateItem(idx, { description: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Min files</Label>
                  <Input type="number" min={1} value={item.minimumFiles} onChange={(e) => updateItem(idx, { minimumFiles: Number(e.target.value) || 1 })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Max files</Label>
                  <Input
                    type="number"
                    min={1}
                    value={item.maximumFiles ?? ""}
                    onChange={(e) => updateItem(idx, { maximumFiles: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tax year</Label>
                  <Input type="number" value={item.taxYear ?? ""} onChange={(e) => updateItem(idx, { taxYear: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={item.isRequired} onCheckedChange={(v) => updateItem(idx, { isRequired: v === true })} />
                Required
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={sendNow} onCheckedChange={(v) => setSendNow(v === true)} />
          Send to client immediately
        </label>
        <Button type="submit" variant="brand" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {sendNow ? "Send request" : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
