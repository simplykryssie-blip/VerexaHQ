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
import { SearchablePicker, type PickerOption } from "@/features/engagements/client-picker";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";

export function NewConversationDialog({ workspaceId, clients, fixedClientId }: { workspaceId: string; clients: PickerOption[]; fixedClientId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(fixedClientId ?? null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !body.trim()) {
      setError("Choose a client and enter an opening message.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({ workspace_id: workspaceId, client_id: clientId, subject: subject || null, created_by: user?.id ?? null })
      .select("id")
      .single();

    if (convError || !conversation) {
      setError(friendlyDbError(convError?.message));
      setSubmitting(false);
      return;
    }

    const { error: msgError } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      conversation_id: conversation.id,
      sender_user_id: user!.id,
      sender_type: "staff",
      body: body.trim(),
      client_visible: true,
    });

    setSubmitting(false);
    if (msgError) {
      setError(friendlyDbError(msgError.message));
      return;
    }
    toast.success("Conversation started");
    setOpen(false);
    router.push(`/messages/${conversation.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" size="sm">
          <Plus className="h-4 w-4" /> New conversation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
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
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?" />
          </div>
          <div className="space-y-1">
            <Label>Message *</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Start conversation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
