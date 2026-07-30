"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Paperclip, Loader2, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type MessageRow = Tables<"messages"> & {
  attachment?: { id: string; display_name: string; bucket_id: string; storage_path: string } | null;
};
type DocOption = { id: string; display_name: string };

export function ConversationPanel({
  conversationId,
  workspaceId,
  clientId,
  currentUserId,
  initialMessages,
  clientDocuments,
}: {
  conversationId: string;
  workspaceId: string;
  clientId: string;
  currentUserId: string;
  initialMessages: MessageRow[];
  clientDocuments: DocOption[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [clientVisible, setClientVisible] = useState(true);
  const [attachment, setAttachment] = useState<DocOption | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unreadIds = initialMessages.filter((m) => m.sender_type === "client" && !m.read_at).map((m) => m.id);
    if (unreadIds.length === 0) return;
    supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        sender_user_id: currentUserId,
        sender_type: "staff",
        body: body.trim(),
        client_visible: clientVisible,
        attachment_document_id: attachment?.id ?? null,
      })
      .select("*")
      .single();
    setSending(false);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    setMessages((prev) => [...prev, data]);
    setBody("");
    setAttachment(null);
    router.refresh();
  }

  async function downloadAttachment(m: MessageRow) {
    if (!m.attachment) return;
    const { data, error } = await supabase.storage.from(m.attachment.bucket_id).createSignedUrl(m.attachment.storage_path, 300);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No messages yet — say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.sender_type === "staff" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                m.sender_type === "staff" ? "bg-brand-gradient text-primary-foreground" : "bg-secondary",
              )}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.attachment && (
                <button
                  type="button"
                  onClick={() => downloadAttachment(m)}
                  className="mt-1.5 flex items-center gap-1 text-xs underline underline-offset-2 opacity-90 hover:opacity-100"
                >
                  <Download className="h-3 w-3" /> {m.attachment.display_name}
                </button>
              )}
              <div className="flex items-center gap-1.5 mt-1 text-[10px] opacity-70">
                {formatDateTime(m.created_at)}
                {!m.client_visible && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px]">
                    <EyeOff className="h-2.5 w-2.5 mr-0.5" /> Internal
                  </Badge>
                )}
                {m.sender_type === "client" && m.read_at && <span>· Read</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        {attachment && (
          <div className="flex items-center justify-between rounded-md bg-secondary px-2 py-1 text-xs">
            <span className="flex items-center gap-1">
              <Paperclip className="h-3 w-3" /> {attachment.display_name}
            </span>
            <button type="button" onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
              Remove
            </button>
          </div>
        )}
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Write a message…" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AttachmentPickerDialog clientId={clientId} workspaceId={workspaceId} documents={clientDocuments} onPick={setAttachment} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(v === true)} />
              {clientVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              Client can see this
            </label>
          </div>
          <Button size="sm" variant="brand" disabled={sending || !body.trim()} onClick={send}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttachmentPickerDialog({
  clientId,
  workspaceId,
  documents,
  onPick,
}: {
  clientId: string;
  workspaceId: string;
  documents: DocOption[];
  onPick: (doc: DocOption) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${workspaceId}/${clientId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("tax-client-documents").upload(path, file, { contentType: file.type });
    if (uploadError) {
      toast.error(friendlyDbError(uploadError.message));
      setUploading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: doc, error } = await supabase
      .from("documents")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        bucket_id: "tax-client-documents",
        storage_path: path,
        original_filename: file.name,
        display_name: file.name,
        mime_type: file.type,
        file_size_bytes: file.size,
        source: "staff_upload",
        uploaded_by_user_id: user?.id ?? null,
      })
      .select("id, display_name")
      .single();
    setUploading(false);
    if (error || !doc) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    onPick(doc);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <Paperclip className="h-4 w-4" /> Attach
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a document</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="existing">
          <TabsList>
            <TabsTrigger value="existing">Existing document</TabsTrigger>
            <TabsTrigger value="upload">Upload new</TabsTrigger>
          </TabsList>
          <TabsContent value="existing">
            <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-md border border-border">
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3">No documents on file for this client yet.</p>
              ) : (
                documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => {
                      onPick(d);
                      setOpen(false);
                    }}
                  >
                    {d.display_name}
                  </button>
                ))
              )}
            </div>
          </TabsContent>
          <TabsContent value="upload">
            <Input type="file" disabled={uploading} onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            {uploading && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
              </p>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
