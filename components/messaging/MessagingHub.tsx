"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Send, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import type { MessageRow, MessageThreadRow } from "./types";

type Audience = "staff" | "portal";

export function MessagingHub({
  workspaceId,
  threads,
  messages,
  currentUserId,
  audience,
  newThreadEntity,
}: {
  workspaceId: string;
  threads: MessageThreadRow[];
  messages: MessageRow[];
  currentUserId: string;
  audience: Audience;
  /** Portal only: lets the client open a brand-new conversation with the firm. */
  newThreadEntity?: { entityType: "client"; entityId: string };
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const otherSide = audience === "staff" ? "client" : "staff";

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => new Date(b.last_message_at ?? b.id).getTime() - new Date(a.last_message_at ?? a.id).getTime()),
    [threads]
  );

  const [selectedId, setSelectedId] = useState<string | null>(sortedThreads[0]?.id ?? null);
  // Mobile only: which panel is showing (there's no room to show the
  // thread list and the conversation side by side below the sm breakpoint).
  const [mobileShowConversation, setMobileShowConversation] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [composingNew, setComposingNew] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [sending, setSending] = useState(false);

  function unreadCount(threadId: string) {
    return messages.filter((m) => m.thread_id === threadId && m.sender_type === otherSide && !m.read_at).length;
  }

  const visibleThreads = sortedThreads.filter((t) => {
    if (unreadOnly && unreadCount(t.id) === 0) return false;
    if (!search) return true;
    const haystack = `${t.subject ?? ""} ${t.contextLabel ?? ""}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  const selectedThread = visibleThreads.find((t) => t.id === selectedId) ?? visibleThreads[0] ?? null;
  const threadMessages = selectedThread ? messages.filter((m) => m.thread_id === selectedThread.id) : [];

  async function selectThread(id: string) {
    setSelectedId(id);
    setMobileShowConversation(true);
    const unread = messages.filter((m) => m.thread_id === id && m.sender_type === otherSide && !m.read_at);
    if (unread.length > 0) {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread.map((m) => m.id));
      router.refresh();
    }
  }

  async function send() {
    if (!selectedThread || !body.trim()) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      thread_id: selectedThread.id,
      sender_type: audience === "staff" ? "staff" : "client",
      sender_id: currentUserId,
      body: body.trim(),
      is_internal: audience === "staff" && isInternal,
    });
    setSending(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setBody("");
    setIsInternal(false);
    router.refresh();
  }

  async function createThread() {
    if (!newThreadEntity || !newBody.trim()) return;
    setSending(true);
    const { data: thread, error: threadError } = await supabase
      .from("message_threads")
      .insert({
        workspace_id: workspaceId,
        entity_type: newThreadEntity.entityType,
        entity_id: newThreadEntity.entityId,
        subject: newSubject.trim() || null,
        channel: "portal",
        created_by: currentUserId,
      })
      .select("id")
      .single();
    if (threadError || !thread) {
      setSending(false);
      toast.show(threadError?.message ?? "Could not start conversation", "error");
      return;
    }
    const { error: messageError } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      thread_id: thread.id,
      sender_type: "client",
      sender_id: currentUserId,
      body: newBody.trim(),
      is_internal: false,
    });
    setSending(false);
    if (messageError) {
      toast.show(messageError.message, "error");
      return;
    }
    setComposingNew(false);
    setNewSubject("");
    setNewBody("");
    setSelectedId(thread.id);
    setMobileShowConversation(true);
    toast.show("Message sent", "success");
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] gap-4">
      <div
        className={`w-full flex-col rounded-xl border border-border bg-surface sm:flex sm:w-72 sm:shrink-0 ${
          mobileShowConversation ? "hidden" : "flex"
        }`}
      >
        <div className="space-y-2 border-b border-border p-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              aria-label="Search conversations"
              className="w-full rounded-lg border border-border py-1.5 pl-8 pr-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                unreadOnly ? "bg-accent text-white" : "bg-surfaceMuted text-muted hover:text-ink"
              }`}
            >
              Unread only
            </button>
            {newThreadEntity && (
              <button
                type="button"
                onClick={() => {
                  setComposingNew(true);
                  setMobileShowConversation(true);
                }}
                className="text-xs font-medium text-accent hover:underline"
              >
                New message
              </button>
            )}
          </div>
        </div>
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {visibleThreads.length === 0 ? (
            <li className="p-4">
              <EmptyState message="No conversations." />
            </li>
          ) : (
            visibleThreads.map((t) => {
              const unread = unreadCount(t.id);
              const active = selectedThread?.id === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => selectThread(t.id)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition ${
                      active ? "bg-accentSoft" : "hover:bg-surfaceMuted"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate font-medium ${active ? "text-accent" : "text-ink"}`}>
                        {t.contextLabel ?? t.subject ?? "Conversation"}
                      </span>
                      {unread > 0 && <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{unread}</span>}
                    </span>
                    <span className="truncate text-xs text-muted">{t.subject ?? "No subject"}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className={`flex-1 flex-col rounded-xl border border-border bg-surface sm:flex ${mobileShowConversation ? "flex" : "hidden"}`}>
        {composingNew && newThreadEntity ? (
          <div className="flex flex-1 flex-col p-4">
            <button
              type="button"
              onClick={() => {
                setComposingNew(false);
                setMobileShowConversation(false);
              }}
              className="mb-2 self-start text-xs font-medium text-accent hover:underline sm:hidden"
            >
              &larr; Back to conversations
            </button>
            <h3 className="text-sm font-semibold text-ink">New message</h3>
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="mt-3 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Type your message..."
              rows={5}
              className="mt-3 flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={createThread}
                disabled={sending || !newBody.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {sending ? "Sending..." : "Send"}
              </button>
              <button type="button" onClick={() => setComposingNew(false)} className="text-sm text-muted hover:text-ink">
                Cancel
              </button>
            </div>
          </div>
        ) : !selectedThread ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState message="Select a conversation." />
          </div>
        ) : (
          <>
            <div className="border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setMobileShowConversation(false)}
                className="mb-1.5 text-xs font-medium text-accent hover:underline sm:hidden"
              >
                &larr; Back to conversations
              </button>
              <p className="text-sm font-semibold text-ink">{selectedThread.contextLabel ?? selectedThread.subject ?? "Conversation"}</p>
              {selectedThread.subject && selectedThread.contextLabel && <p className="text-xs text-muted">{selectedThread.subject}</p>}
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {threadMessages.length === 0 ? (
                <EmptyState message="No messages yet." />
              ) : (
                threadMessages.map((m) => {
                  const mine = m.sender_type === (audience === "staff" ? "staff" : "client");
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                          m.is_internal
                            ? "border border-dashed border-warning/50 bg-warning/10 text-slate"
                            : mine
                              ? "bg-accent text-white"
                              : "bg-surfaceMuted text-slate"
                        }`}
                      >
                        {m.is_internal && (
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-warning">
                            <Lock size={10} aria-hidden="true" /> Internal note
                          </span>
                        )}
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>
                          {new Date(m.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-border p-3">
              {audience === "staff" && (
                <label className="mb-2 flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="h-3.5 w-3.5 rounded border-border" />
                  Internal note (not visible to client)
                </label>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Type a message..."
                  rows={2}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !body.trim()}
                  aria-label="Send message"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
