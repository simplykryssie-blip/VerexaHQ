"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type ApprovalRow = Tables<"workflow_approvals"> & {
  run: { id: string; definition: { id: string; name: string } | null } | null;
};

export function MyApprovalsList({ approvals }: { approvals: ApprovalRow[] }) {
  const router = useRouter();

  if (approvals.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">You have no pending approvals.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {approvals.map((a) => (
        <ApprovalCard key={a.id} approval={a} onResolved={() => router.refresh()} />
      ))}
    </div>
  );
}

function ApprovalCard({ approval, onResolved }: { approval: ApprovalRow; onResolved: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolve(status: "approved" | "rejected") {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("workflow_approvals")
      .update({ status, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(), resolution_notes: notes || null })
      .eq("id", approval.id);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(`Approval ${status}`);
    setOpen(false);
    onResolved();
  }

  return (
    <Card>
      <CardContent className="py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">{approval.title}</p>
          {approval.instructions && <p className="text-xs text-muted-foreground mt-0.5">{approval.instructions}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">
            {approval.run?.definition && (
              <Link href={`/workflows/runs/${approval.run.id}`} className="hover:underline">
                {approval.run.definition.name}
              </Link>
            )}
            {" · Requested "}
            {formatDateTime(approval.requested_at)}
            {approval.due_at && ` · Due ${formatDateTime(approval.due_at)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve("approved")}>
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost">
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject: {approval.title}</DialogTitle>
              </DialogHeader>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Reason (optional)" />
              <DialogFooter>
                <Button variant="destructive" disabled={busy} onClick={() => resolve("rejected")}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Reject
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
