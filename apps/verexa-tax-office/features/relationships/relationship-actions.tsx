"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { RELATIONSHIP_TYPE_LABELS } from "@/lib/validation/relationships";
import type { Enums } from "@/types/database";

export function NewRelationshipDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [type, setType] = useState<Enums<"relationship_type">>("service_bureau_to_ero");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetId.trim()) {
      setError("Enter the other office's workspace ID.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: dbError } = await supabase.from("workspace_relationships").insert({
      source_workspace_id: workspaceId,
      target_workspace_id: targetId.trim(),
      relationship_type: type,
      terms: notes ? { notes } : {},
      created_by: user?.id ?? null,
    });
    setSubmitting(false);
    if (dbError) {
      setError(friendlyDbError(dbError.message));
      return;
    }
    toast.success("Relationship request sent");
    setOpen(false);
    setTargetId("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <Plus className="h-4 w-4" /> New relationship
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect with another office</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Their workspace ID *</Label>
            <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="Ask the other office's admin for this (Settings → Office ID)" />
          </div>
          <div className="space-y-1">
            <Label>Relationship type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RELATIONSHIP_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RelationshipStatusActions({ relationshipId, status, canManage }: { relationshipId: string; status: string; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function updateStatus(next: string) {
    setBusy(true);
    const { error } = await supabase.from("workspace_relationships").update({ status: next as never }).eq("id", relationshipId);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Relationship updated");
    router.refresh();
  }

  if (!canManage) return null;

  return (
    <div className="flex items-center gap-1">
      {status === "pending" && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => updateStatus("active")}>
            Activate
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => updateStatus("declined")}>
            Cancel request
          </Button>
        </>
      )}
      {status === "active" && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => updateStatus("ended")}>
          End
        </Button>
      )}
    </div>
  );
}
