"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

export function TaskComments({ taskId, workspaceId, comments }: { taskId: string; workspaceId: string; comments: Tables<"task_comments">[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [body, setBody] = useState("");
  const [clientVisible, setClientVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("task_comments").insert({
      task_id: taskId,
      workspace_id: workspaceId,
      author_user_id: user?.id ?? null,
      body: body.trim(),
      client_visible: clientVisible,
    });
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    setBody("");
    setClientVisible(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div key={c.id} className="rounded-md border border-border p-3 text-sm">
          <p>{c.body}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant={c.client_visible ? "secondary" : "outline"}>{c.client_visible ? "Client visible" : "Internal"}</Badge>
            <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
          </div>
        </div>
      ))}
      {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}

      <div className="space-y-2 pt-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add a comment…" />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(v === true)} />
            Visible to client
          </label>
          <Button size="sm" variant="brand" disabled={busy || !body.trim()} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
