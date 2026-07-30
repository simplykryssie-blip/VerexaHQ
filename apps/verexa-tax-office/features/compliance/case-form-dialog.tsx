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
import { COMPLIANCE_CASE_TYPE_LABELS, RISK_LEVEL_LABELS } from "@/lib/validation/compliance";

export function ComplianceCaseFormDialog({
  workspaceId,
  clients,
  staff,
  fixedClientId,
  fixedEngagementId,
}: {
  workspaceId: string;
  clients: PickerOption[];
  staff: PickerOption[];
  fixedClientId?: string;
  fixedEngagementId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [caseType, setCaseType] = useState<keyof typeof COMPLIANCE_CASE_TYPE_LABELS>("quality_review");
  const [riskLevel, setRiskLevel] = useState<keyof typeof RISK_LEVEL_LABELS>("low");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !title.trim()) {
      setError("Choose a client and enter a title.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("compliance_cases")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        engagement_id: fixedEngagementId ?? null,
        title: title.trim(),
        description: description || null,
        case_type: caseType,
        risk_level: riskLevel,
        assigned_to_user_id: assignedTo,
        due_at: dueAt || null,
      })
      .select("id")
      .single();
    setSubmitting(false);
    if (dbError || !data) {
      setError(friendlyDbError(dbError?.message));
      return;
    }
    toast.success("Compliance case opened");
    setOpen(false);
    router.push(`/compliance/${data.id}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <Plus className="h-4 w-4" /> Open case
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a compliance case</DialogTitle>
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
              <SearchablePicker options={clients} value={clientId} onChange={setClientId} placeholder="Search clients…" />
            </div>
          )}
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Case type</Label>
              <Select value={caseType} onValueChange={(v) => setCaseType(v as typeof caseType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(COMPLIANCE_CASE_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Risk level</Label>
              <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as typeof riskLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RISK_LEVEL_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Assign to</Label>
              <SearchablePicker options={staff} value={assignedTo} onChange={setAssignedTo} placeholder="Staff member…" />
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Open case
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
