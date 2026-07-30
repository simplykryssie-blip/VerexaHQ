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
  templates,
  clients,
  fixedClientId,
  trigger,
}: {
  templates: { id: string; name: string; is_system_template: boolean }[];
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
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("assign_form_to_client", {
      p_client_id: clientId,
      p_template_id: templateId,
      p_service_id: undefined,
      p_due_date: dueDate || undefined,
      p_client_message: clientMessage || undefined,
      p_internal_notes: internalNotes || undefined,
    });
    setSubmitting(false);
    if (rpcError || !data) {
      setError(friendlyDbError(rpcError?.message));
      return;
    }
    toast.success("Organizer assigned to client");
    setOpen(false);
    router.push(`/intake/${data}`);
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
