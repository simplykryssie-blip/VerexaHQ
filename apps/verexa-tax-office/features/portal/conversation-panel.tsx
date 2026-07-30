"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type MessageRow = Tables<"messages"> & {
  attachment?: { id: string; display_name: string; bucket_id: string; storage_path: string } | null;
};

export function PortalConversationPanel({
  conversationId,
  workspaceId,
  clientId,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  workspaceId: string;
  clientId: string;
  currentUserId: string;
  initialMessages: MessageRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unreadIds = initialMessages.filter((m) => m.sender_type !== "client" && !m.read_at).map((m) => m.id);
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
        sender_type: "client",
        body: body.trim(),
        client_visible: true,
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
          <div key={m.id} className={cn("flex", m.sender_type === "client" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                m.sender_type === "client" ? "bg-brand-gradient text-primary-foreground" : "bg-secondary",
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
              <div className="flex items-center gap-1.5 mt-1 text-[10px] opacity-70">{formatDateTime(m.created_at)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Write a message…" />
        <div className="flex items-center justify-end">
          <Button size="sm" variant="brand" disabled={sending || !body.trim()} onClick={send}>
            {sending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
