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
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { WORKFLOW_TRIGGER_LABELS } from "@/lib/validation/workflows";
import type { Enums } from "@/types/database";

export function NewWorkflowDialog({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<Enums<"workflow_trigger_type">>("manual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: template, error: tError } = await supabase
      .from("templates")
      .insert({ workspace_id: workspaceId, kind: "workflow", name: name.trim(), description: description || null, status: "draft", visibility: "workspace" })
      .select("id")
      .single();
    if (tError || !template) {
      setError(friendlyDbError(tError?.message));
      setSubmitting(false);
      return;
    }

    const { data: version, error: vError } = await supabase
      .from("template_versions")
      .insert({ template_id: template.id, version_number: 1, status: "draft", name: name.trim(), content: {}, created_by: user?.id ?? null })
      .select("id")
      .single();
    if (vError || !version) {
      setError(friendlyDbError(vError?.message));
      setSubmitting(false);
      return;
    }
    await supabase.from("templates").update({ current_version_id: version.id }).eq("id", template.id);

    const { data: definition, error: dError } = await supabase
      .from("workflow_definitions")
      .insert({
        template_id: template.id,
        template_version_id: version.id,
        workspace_id: workspaceId,
        name: name.trim(),
        description: description || null,
        trigger_type: triggerType,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    setSubmitting(false);
    if (dError || !definition) {
      setError(friendlyDbError(dError?.message));
      return;
    }
    toast.success("Workflow created");
    setOpen(false);
    router.push(`/workflows/${definition.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <Plus className="h-4 w-4" /> New workflow
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New client onboarding" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Trigger</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as typeof triggerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(WORKFLOW_TRIGGER_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create workflow
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
