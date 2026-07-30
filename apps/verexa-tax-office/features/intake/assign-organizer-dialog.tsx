"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";

export function AssignOrganizerDialog({
  workspaceId,
  templates,
  clients,
  fixedClientId,
  trigger,
}: {
  workspaceId: string;
  templates: { id: string; name: string; is_system_template: boolean; latest_published_version_id: string | null }[];
  clients?: PickerOption[];
  fixedClientId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [templateId, setTemplateId] = useState<string | null>(templates[0]?.id ?? null);
  const [dueDate, setDueDate] = useState("");
  const [clientMessage, setClientMessage] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !templateId) {
      setError("Choose a client and an organizer template.");
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template?.latest_published_version_id) {
      setError("That template has no published version to assign.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Generate the id client-side and skip .select() on the insert:
    // intake_submissions' SELECT policy resolves only through a
    // self-referential can_access_intake_submission(id) function, which
    // can't see a row inserted by the same statement, so
    // INSERT ... RETURNING reliably fails RLS even for an authorized staff
    // caller. Knowing the id up front sidesteps it.
    const submissionId = crypto.randomUUID();
    const { error: insertError } = await supabase.from("intake_submissions").insert({
      id: submissionId,
      workspace_id: workspaceId,
      client_id: clientId,
      template_id: templateId,
      template_version_id: template.latest_published_version_id,
      due_date: dueDate || null,
      assigned_by: user?.id ?? null,
      metadata: { client_message: clientMessage || null, internal_notes: internalNotes || null },
    });
    if (insertError) {
      setSubmitting(false);
      setError(friendlyDbError(insertError.message));
      return;
    }
    await supabase.from("notifications").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      type: "form_assigned",
      title: "New organizer assigned",
      message: `${template.name} has been assigned to you.`,
    });
    setSubmitting(false);
    toast.success("Organizer assigned to client");
    setOpen(false);
    router.push(`/intake/${submissionId}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="brand" size="sm">
            <Plus className="h-4 w-4" /> Assign organizer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign an intake organizer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!fixedClientId && (
            <div className="space-y-1">
              <Label>Client *</Label>
              <SearchablePicker options={clients ?? []} value={clientId} onChange={setClientId} placeholder="Search clients…" />
            </div>
          )}
          <div className="space-y-1">
            <Label>Organizer template *</Label>
            <Select value={templateId ?? ""} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} {t.is_system_template ? "(system)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Message to client (optional)</Label>
            <Textarea value={clientMessage} onChange={(e) => setClientMessage(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Internal notes (optional)</Label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Assign organizer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
