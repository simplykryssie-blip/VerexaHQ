"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { COMPLIANCE_CASE_STATUS_LABELS, caseStatusLabel, riskLevelLabel } from "@/lib/validation/compliance";
import { reviewResultLabel } from "@/lib/validation/intake";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type CaseRow = Tables<"compliance_cases">;
type FlagRow = Tables<"compliance_flags">;
type ChecklistRow = Tables<"compliance_checklists"> & { items: Tables<"compliance_checklist_items">[] };

export function CompliancePanel({ complianceCase, flags, checklists }: { complianceCase: CaseRow; flags: FlagRow[]; checklists: ChecklistRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState(complianceCase.status);
  const [savingStatus, setSavingStatus] = useState(false);

  async function updateStatus(next: typeof status) {
    setStatus(next);
    setSavingStatus(true);
    const { error } = await supabase.from("compliance_cases").update({ status: next }).eq("id", complianceCase.id);
    setSavingStatus(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{complianceCase.title}</CardTitle>
            <CardDescription>{complianceCase.description}</CardDescription>
          </div>
          <Badge variant={complianceCase.risk_level === "critical" || complianceCase.risk_level === "high" ? "destructive" : "warning"}>
            {riskLevelLabel(complianceCase.risk_level)} risk
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={status} onValueChange={(v) => updateStatus(v as typeof status)} disabled={savingStatus}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(COMPLIANCE_CASE_STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ResolveCaseDialog caseId={complianceCase.id} onResolved={() => router.refresh()} />
          {complianceCase.resolution_summary && (
            <p className="text-xs text-muted-foreground">Resolved: {complianceCase.resolution_summary}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Flags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flags linked to this case.</p>
          ) : (
            flags.map((f) => <FlagRowItem key={f.id} flag={f} onResolved={() => router.refresh()} />)
          )}
        </CardContent>
      </Card>

      {checklists.map((c) => (
        <ChecklistCard key={c.id} checklist={c} onChanged={() => router.refresh()} />
      ))}

      <AddChecklistDialog workspaceId={complianceCase.workspace_id} caseId={complianceCase.id} onCreated={() => router.refresh()} />
    </div>
  );
}

function ResolveCaseDialog({ caseId, onResolved }: { caseId: string; onResolved: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const { error } = await supabase
      .from("compliance_cases")
      .update({ status: "resolved", resolution_summary: summary, resolved_at: new Date().toISOString() })
      .eq("id", caseId);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Case resolved");
    setOpen(false);
    onResolved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Resolve case
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve compliance case</DialogTitle>
        </DialogHeader>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Resolution summary…" />
        <DialogFooter>
          <Button variant="brand" disabled={!summary.trim() || busy} onClick={resolve}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagRowItem({ flag, onResolved }: { flag: FlagRow; onResolved: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const { error } = await supabase
      .from("compliance_flags")
      .update({ is_resolved: true, resolution_notes: notes, resolved_at: new Date().toISOString() })
      .eq("id", flag.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Flag resolved");
    setOpen(false);
    onResolved();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{flag.title}</p>
          <p className="text-xs text-muted-foreground">{flag.explanation}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={flag.is_resolved ? "success" : "warning"}>{flag.is_resolved ? "Resolved" : riskLevelLabel(flag.risk_level)}</Badge>
          {!flag.is_resolved && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  Resolve
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Resolve flag: {flag.title}</DialogTitle>
                </DialogHeader>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Resolution notes…" />
                <DialogFooter>
                  <Button variant="brand" disabled={!notes.trim() || busy} onClick={resolve}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Mark resolved
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
      {flag.resolved_at && <p className="text-xs text-muted-foreground mt-2">Resolved {formatDateTime(flag.resolved_at)}: {flag.resolution_notes}</p>}
    </div>
  );
}

function ChecklistCard({ checklist, onChanged }: { checklist: ChecklistRow; onChanged: () => void }) {
  const supabase = createClient();
  const [newItemLabel, setNewItemLabel] = useState("");
  const [adding, setAdding] = useState(false);

  async function addItem() {
    if (!newItemLabel.trim()) return;
    setAdding(true);
    const itemKey = newItemLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 60) || `item_${Date.now()}`;
    const { error } = await supabase.from("compliance_checklist_items").insert({
      checklist_id: checklist.id,
      workspace_id: checklist.workspace_id,
      item_key: itemKey,
      label: newItemLabel.trim(),
      sort_order: checklist.items.length,
    });
    setAdding(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    setNewItemLabel("");
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{checklist.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {checklist.items.length === 0 && <p className="text-sm text-muted-foreground">No checklist items yet.</p>}
        {checklist.items
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => (
            <ChecklistItemRow key={item.id} item={item} onChanged={onChanged} />
          ))}
        <div className="flex items-center gap-2 pt-2">
          <Input placeholder="Add checklist item…" value={newItemLabel} onChange={(e) => setNewItemLabel(e.target.value)} />
          <Button size="sm" variant="outline" onClick={addItem} disabled={adding || !newItemLabel.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistItemRow({ item, onChanged }: { item: Tables<"compliance_checklist_items">; onChanged: () => void }) {
  const supabase = createClient();
  const [result, setResult] = useState(item.result);
  const [busy, setBusy] = useState(false);

  async function save(next: typeof result) {
    setResult(next);
    setBusy(true);
    const { error } = await supabase
      .from("compliance_checklist_items")
      .update({ result: next, reviewed_at: new Date().toISOString() })
      .eq("id", item.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    onChanged();
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
      <div>
        <p className="text-sm">{item.label}</p>
        {item.is_required && <span className="text-xs text-muted-foreground">Required</span>}
      </div>
      <Select value={result} onValueChange={(v) => save(v as typeof result)} disabled={busy}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["pending", "pass", "fail", "needs_clarification", "not_applicable"].map((r) => (
            <SelectItem key={r} value={r}>
              {reviewResultLabel(r)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AddChecklistDialog({ workspaceId, caseId, onCreated }: { workspaceId: string; caseId: string; onCreated: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("compliance_checklists").insert({ workspace_id: workspaceId, compliance_case_id: caseId, title: title.trim() });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Checklist added");
    setOpen(false);
    setTitle("");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Add checklist
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a checklist</DialogTitle>
        </DialogHeader>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Checklist title" />
        <DialogFooter>
          <Button variant="brand" disabled={!title.trim() || busy} onClick={create}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
