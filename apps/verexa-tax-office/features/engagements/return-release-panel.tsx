"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type Controls = Tables<"return_release_controls">;

type Evaluation = { payment_ok: boolean; signature_ok: boolean; review_ok: boolean; can_release: boolean };

export function ReturnReleasePanel({ engagementId, initialControls }: { engagementId: string; initialControls: Controls | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [open, setOpen] = useState(false);

  async function evaluate() {
    setBusy(true);
    const { data, error } = await supabase.rpc("evaluate_return_release", { p_engagement_id: engagementId });
    setBusy(false);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    setEvaluation(data as unknown as Evaluation);
    router.refresh();
  }

  async function release() {
    setBusy(true);
    const { error } = await supabase.rpc("release_completed_return", { p_engagement_id: engagementId, p_notes: notes || undefined });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Return released to client");
    setOpen(false);
    router.refresh();
  }

  const alreadyReleased = !!initialControls?.released_at;
  const canRelease = evaluation?.can_release ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Return release</CardTitle>
        <CardDescription>The completed return unlocks for the client only once every enabled requirement below is satisfied.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {alreadyReleased ? (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            Released {formatDateTime(initialControls?.released_at)}
            {initialControls?.release_notes && <p className="mt-1 text-foreground/80">{initialControls.release_notes}</p>}
          </div>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={busy} onClick={evaluate}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Check requirements
            </Button>
            {evaluation && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Requirement label="Payment" ok={evaluation.payment_ok} />
                <Requirement label="Signature" ok={evaluation.signature_ok} />
                <Requirement label="Review" ok={evaluation.review_ok} />
              </div>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="brand" disabled={!canRelease}>
                  <Unlock className="h-4 w-4" /> Release completed return
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Release completed return</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-muted-foreground">
                  This unlocks the completed return for the client in their portal. It does not transmit the return — Verexa only tracks e-file status.
                </p>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Release notes (optional)" />
                <DialogFooter>
                  <Button variant="brand" disabled={busy} onClick={release}>
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Release
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {!canRelease && evaluation && <p className="text-xs text-muted-foreground">All enabled requirements must pass before release.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Requirement({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md border p-2 text-sm", ok ? "border-success/30 bg-success/5" : "border-border")}>
      {ok ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-muted-foreground" />}
      {label}
      <Badge variant={ok ? "success" : "outline"} className="ml-auto">
        {ok ? "Met" : "Not met"}
      </Badge>
    </div>
  );
}
