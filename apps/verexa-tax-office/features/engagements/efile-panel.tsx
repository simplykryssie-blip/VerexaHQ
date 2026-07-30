"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/formatters";
import type { Enums, Tables } from "@/types/database";

type EfileEventType = Enums<"efile_event_type">;

const EFILE_EVENT_LABELS: Record<EfileEventType, string> = {
  not_ready: "Not ready",
  ready: "Ready to transmit",
  transmitted: "Transmitted",
  accepted: "Accepted",
  rejected: "Rejected",
  acknowledged: "Acknowledged",
  withdrawn: "Withdrawn",
};

export function EfilePanel({ workspaceId, engagementId, events }: { workspaceId: string; engagementId: string; events: Tables<"efile_events">[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState<EfileEventType>("ready");
  const [submissionId, setSubmissionId] = useState("");
  const [ackCode, setAckCode] = useState("");
  const [rejectionCode, setRejectionCode] = useState("");
  const [rejectionMessage, setRejectionMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const latest = events[events.length - 1];

  async function logEvent() {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("efile_events").insert({
      workspace_id: workspaceId,
      engagement_id: engagementId,
      event_type: eventType,
      external_submission_id: submissionId || null,
      acknowledgment_code: ackCode || null,
      rejection_code: rejectionCode || null,
      rejection_message: rejectionMessage || null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("E-file event logged");
    setOpen(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">E-file tracking</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Verexa tracks e-file status only — returns are transmitted through your tax software.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4" /> Log event
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log an e-file status update</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Event</Label>
                <Select value={eventType} onValueChange={(v) => setEventType(v as EfileEventType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EFILE_EVENT_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Submission ID (from your tax software)</Label>
                <Input value={submissionId} onChange={(e) => setSubmissionId(e.target.value)} />
              </div>
              {eventType === "accepted" || eventType === "acknowledged" ? (
                <div className="space-y-1">
                  <Label>Acknowledgment code</Label>
                  <Input value={ackCode} onChange={(e) => setAckCode(e.target.value)} />
                </div>
              ) : null}
              {eventType === "rejected" && (
                <>
                  <div className="space-y-1">
                    <Label>Rejection code</Label>
                    <Input value={rejectionCode} onChange={(e) => setRejectionCode(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Rejection message</Label>
                    <Textarea value={rejectionMessage} onChange={(e) => setRejectionMessage(e.target.value)} rows={2} />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="brand" disabled={busy} onClick={logEvent}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Log event
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="space-y-2">
        {latest && (
          <Badge variant={latest.event_type === "rejected" ? "destructive" : latest.event_type === "accepted" || latest.event_type === "acknowledged" ? "success" : "secondary"}>
            Current: {EFILE_EVENT_LABELS[latest.event_type]}
          </Badge>
        )}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No e-file events logged yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm mt-2">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{EFILE_EVENT_LABELS[e.event_type]}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(e.occurred_at)}</span>
                </div>
                {e.external_submission_id && <p className="text-xs text-muted-foreground">Submission: {e.external_submission_id}</p>}
                {e.rejection_message && <p className="text-xs text-destructive">{e.rejection_message}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
