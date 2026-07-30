"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, FileCheck2, Lock, RotateCcw, MessageCircleWarning, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { reviewResultLabel } from "@/lib/validation/intake";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";
import type { FormSectionRow } from "@/lib/intake/engine";

type Submission = Tables<"intake_submissions">;
type ReviewSectionRow = Tables<"intake_review_sections">;
type CommentRow = Tables<"intake_review_comments">;

export function IntakeReviewPanel({
  submission,
  sections,
  reviewSections,
  comments,
}: {
  submission: Submission;
  sections: FormSectionRow[];
  reviewSections: ReviewSectionRow[];
  comments: CommentRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [complianceResult, setComplianceResult] = useState<Record<string, unknown> | null>(null);
  const [validationResult, setValidationResult] = useState<Record<string, unknown> | null>(null);

  function run(action: string, fn: () => PromiseLike<{ error?: { message: string } | null }>) {
    setBusyAction(action);
    startTransition(async () => {
      const { error } = await fn();
      setBusyAction(null);
      if (error) {
        toast.error(friendlyDbError(error.message));
        return;
      }
      router.refresh();
    });
  }

  const reviewSectionByFieldSectionId = new Map(reviewSections.map((rs) => [rs.section_id, rs]));
  const openComments = comments.filter((c) => !c.resolved_at);
  const resolvedComments = comments.filter((c) => c.resolved_at);

  const status = submission.status;
  const canBeginReview = status === "submitted" || status === "resubmitted";
  const canCompleteReview = status === "under_review";
  const canApproveLock = status === "under_review" || status === "approved";
  const canReopen = status === "approved" || status === "rejected";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review actions</CardTitle>
          <CardDescription>Every transition below calls the workspace&apos;s intake RPCs directly — never a direct status update.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="brand"
            disabled={!canBeginReview || pending}
            onClick={() =>
              run("begin", () => supabase.rpc("begin_intake_review", { p_submission_id: submission.id }))
            }
          >
            {busyAction === "begin" && <Loader2 className="h-4 w-4 animate-spin" />}
            <FileCheck2 className="h-4 w-4" /> Begin review
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={!canCompleteReview || pending}
            onClick={() => run("complete", () => supabase.rpc("complete_intake_review", { p_submission_id: submission.id }))}
          >
            {busyAction === "complete" && <Loader2 className="h-4 w-4 animate-spin" />}
            <CheckCircle2 className="h-4 w-4" /> Complete review
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={!canApproveLock || pending || submission.locked_at !== null}
            onClick={() => run("approve", () => supabase.rpc("approve_and_lock_intake", { p_submission_id: submission.id }))}
          >
            {busyAction === "approve" && <Loader2 className="h-4 w-4 animate-spin" />}
            <Lock className="h-4 w-4" /> Approve & lock
          </Button>

          <ReopenDialog
            disabled={!canReopen || pending}
            onConfirm={(reason) => run("reopen", () => supabase.rpc("reopen_intake", { p_submission_id: submission.id, p_reason: reason }))}
          />

          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setBusyAction("validate");
                const { data, error } = await supabase.rpc("validate_intake_submission", { p_submission_id: submission.id });
                setBusyAction(null);
                if (error) {
                  toast.error(friendlyDbError(error.message));
                  return;
                }
                setValidationResult(data as Record<string, unknown>);
                router.refresh();
              })
            }
          >
            {busyAction === "validate" && <Loader2 className="h-4 w-4 animate-spin" />}
            Validate submission
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setBusyAction("compliance");
                const { data, error } = await supabase.rpc("evaluate_intake_compliance", { p_submission_id: submission.id });
                setBusyAction(null);
                if (error) {
                  toast.error(friendlyDbError(error.message));
                  return;
                }
                setComplianceResult(data as Record<string, unknown>);
                toast.success("Compliance evaluation complete");
                router.refresh();
              })
            }
          >
            {busyAction === "compliance" && <Loader2 className="h-4 w-4 animate-spin" />}
            <ShieldCheck className="h-4 w-4" /> Run compliance check
          </Button>

          <GenerateDocumentRequestButton submissionId={submission.id} />
        </CardContent>
      </Card>

      {validationResult && (
        <Alert title="Validation result">
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(validationResult, null, 2)}</pre>
        </Alert>
      )}
      {complianceResult && (
        <Alert title="Compliance result">
          <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(complianceResult, null, 2)}</pre>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Section review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sections
            .filter((s) => !s.parent_section_id)
            .map((s) => {
              const rs = reviewSectionByFieldSectionId.get(s.id);
              return (
                <SectionReviewRow key={s.id} section={s} reviewSection={rs} submissionId={submission.id} onSaved={() => router.refresh()} />
              );
            })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clarifications</CardTitle>
          <CardDescription>Client-visible comments requesting a fix or explanation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {openComments.length === 0 && resolvedComments.length === 0 && (
            <p className="text-sm text-muted-foreground">No clarifications requested yet.</p>
          )}
          {openComments.map((c) => (
            <ClarificationRow key={c.id} comment={c} onResolved={() => router.refresh()} />
          ))}
          {resolvedComments.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{resolvedComments.length} resolved</summary>
              <div className="mt-2 space-y-2">
                {resolvedComments.map((c) => (
                  <div key={c.id} className="rounded-md border border-border p-2 text-xs">
                    <p>{c.comment}</p>
                    <p className="text-muted-foreground mt-1">Resolved {formatDateTime(c.resolved_at)}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Alert({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium mb-2">{title}</p>
      {children}
    </div>
  );
}

function ReopenDialog({ disabled, onConfirm }: { disabled: boolean; onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <RotateCcw className="h-4 w-4" /> Reopen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen this intake</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Reason *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this being reopened?" />
        </div>
        <DialogFooter>
          <Button
            variant="brand"
            disabled={!reason.trim()}
            onClick={() => {
              onConfirm(reason.trim());
              setOpen(false);
              setReason("");
            }}
          >
            Reopen intake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDocumentRequestButton({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleGenerate() {
    setBusy(true);
    const { data, error } = await supabase.rpc("generate_intake_document_request", { p_submission_id: submissionId, p_send: send });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Document request generated");
    setOpen(false);
    router.push(`/document-requests/${data}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Generate document request
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate a document request from this intake</DialogTitle>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={send} onCheckedChange={(v) => setSend(v === true)} />
          Send to client immediately
        </label>
        <DialogFooter>
          <Button variant="brand" disabled={busy} onClick={handleGenerate}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionReviewRow({
  section,
  reviewSection,
  submissionId,
  onSaved,
}: {
  section: FormSectionRow;
  reviewSection?: Tables<"intake_review_sections">;
  submissionId: string;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [result, setResult] = useState(reviewSection?.result ?? "pending");
  const [notes, setNotes] = useState(reviewSection?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("review_intake_section", {
      p_submission_id: submissionId,
      p_section_id: section.id,
      p_result: result as never,
      p_notes: notes || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(`${section.title} marked ${reviewResultLabel(result)}`);
    onSaved();
  }

  return (
    <div className="rounded-md border border-border p-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <div className="flex-1">
        <p className="text-sm font-medium">{section.title}</p>
        {reviewSection?.reviewed_at && <p className="text-xs text-muted-foreground">Reviewed {formatDateTime(reviewSection.reviewed_at)}</p>}
      </div>
      <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
        <SelectTrigger className="w-full sm:w-48">
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
      <Button size="sm" variant="outline" disabled={busy} onClick={save}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Save
      </Button>
    </div>
  );
}

function ClarificationRow({ comment, onResolved }: { comment: CommentRow; onResolved: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const { error } = await supabase.rpc("resolve_intake_clarification", { p_comment_id: comment.id, p_resolution: resolution });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Clarification resolved");
    setOpen(false);
    onResolved();
  }

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2">
        <MessageCircleWarning className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm">{comment.comment}</p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={comment.is_client_visible ? "secondary" : "outline"}>{comment.is_client_visible ? "Client visible" : "Internal"}</Badge>
            <span className="text-xs text-muted-foreground">{formatDateTime(comment.created_at)}</span>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost">
              <XCircle className="h-4 w-4" /> Resolve
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Resolve clarification</DialogTitle>
            </DialogHeader>
            <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} placeholder="How was this resolved?" />
            <DialogFooter>
              <Button variant="brand" disabled={!resolution.trim() || busy} onClick={resolve}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark resolved
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
