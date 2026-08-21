"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Send, Inbox, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";

export type NetworkThread = {
  id: string;
  otherWorkspaceId: string;
  otherWorkspaceName: string;
  lastMessageAt: string | null;
};

export type NetworkMessage = {
  id: string;
  threadId: string;
  senderWorkspaceId: string;
  senderUserId: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type SenderProfile = { display_name: string | null; avatar_url: string | null };

// Internal (staff-to-staff) messaging between an ERO/SB and its connected
// PTINs -- a separate, purpose-built hub from MessagingHub (client/portal
// messaging) since a thread here is inherently two-*workspace*, not
// two-*audience-within-one-workspace*, and starting a new one means
// picking who's reachable in the network rather than an entity type/id.
export function NetworkMessagingHub({
  workspaceId,
  threads,
  messages,
  currentUserId,
  messageableWorkspaces,
  senderProfiles = {},
}: {
  workspaceId: string;
  threads: NetworkThread[];
  messages: NetworkMessage[];
  currentUserId: string;
  messageableWorkspaces: { workspaceId: string; name: string }[];
  senderProfiles?: Record<string, SenderProfile>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => new Date(b.lastMessageAt ?? b.id).getTime() - new Date(a.lastMessageAt ?? a.id).getTime()),
    [threads]
  );

  const [selectedId, setSelectedId] = useState<string | null>(sortedThreads[0]?.id ?? null);
  const [mobileShowConversation, setMobileShowConversation] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [body, setBody] = useState("");
  const [composingNew, setComposingNew] = useState(false);
  const [newRecipientId, setNewRecipientId] = useState("");
  const [newBody, setNewBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function unreadCount(threadId: string) {
    return messages.filter((m) => m.threadId === threadId && m.senderWorkspaceId !== workspaceId && !m.readAt).length;
  }

  const visibleThreads = sortedThreads.filter((t) => {
    if (unreadOnly && unreadCount(t.id) === 0) return false;
    if (!search) return true;
    return t.otherWorkspaceName.toLowerCase().includes(search.toLowerCase());
  });

  const selectedThread = visibleThreads.find((t) => t.id === selectedId) ?? visibleThreads[0] ?? null;
  const threadMessages = selectedThread ? messages.filter((m) => m.threadId === selectedThread.id) : [];

  // Only offer workspaces that don't already have a thread -- reachable
  // people with an existing conversation are just selected from the list.
  const newRecipientOptions = messageableWorkspaces.filter((w) => !threads.some((t) => t.otherWorkspaceId === w.workspaceId));

  async function selectThread(id: string) {
    setSelectedId(id);
    setMobileShowConversation(true);
    const unread = messages.filter((m) => m.threadId === id && m.senderWorkspaceId !== workspaceId && !m.readAt);
    if (unread.length > 0) {
      await supabase
        .from("network_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread.map((m) => m.id));
      router.refresh();
    }
  }

  async function send() {
    if (!selectedThread || !body.trim()) return;
    setSending(true);
    const { error: sendError } = await supabase.from("network_messages").insert({
      thread_id: selectedThread.id,
      sender_workspace_id: workspaceId,
      sender_user_id: currentUserId,
      body: body.trim(),
    });
    setSending(false);
    if (sendError) {
      toast.show(sendError.message, "error");
      return;
    }
    setBody("");
    router.refresh();
  }

  async function startThread() {
    if (!newRecipientId || !newBody.trim()) return;
    setSending(true);
    setError(null);
    const { data: threadId, error: startError } = await supabase.rpc("start_network_message_thread", {
      p_workspace_id: workspaceId,
      p_other_workspace_id: newRecipientId,
      p_body: newBody.trim(),
    });
    setSending(false);
    if (startError || !threadId) {
      setError(startError?.message ?? "Could not start this conversation.");
      return;
    }
    setComposingNew(false);
    setNewRecipientId("");
    setNewBody("");
    setSelectedId(threadId);
    setMobileShowConversation(true);
    toast.show("Message sent", "success");
    router.refresh();
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] gap-4">
      <div
        className={`w-full flex-col rounded-2xl border border-border bg-surface shadow-soft sm:flex sm:w-72 sm:shrink-0 ${
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
            {newRecipientOptions.length > 0 && (
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
              <EmptyState icon={Inbox} message="No conversations." />
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
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition ${
                      active ? "bg-accentSoft" : "hover:bg-surfaceMuted"
                    }`}
                  >
                    <span className={`truncate font-medium ${active ? "text-accent" : "text-ink"}`}>{t.otherWorkspaceName}</span>
                    {unread > 0 && <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">{unread}</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <div className={`flex-1 flex-col rounded-2xl border border-border bg-surface shadow-soft sm:flex ${mobileShowConversation ? "flex" : "hidden"}`}>
        {composingNew ? (
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
            <select
              value={newRecipientId}
              onChange={(e) => setNewRecipientId(e.target.value)}
              className="mt-3 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Choose who to message...</option>
              {newRecipientOptions.map((w) => (
                <option key={w.workspaceId} value={w.workspaceId}>
                  {w.name}
                </option>
              ))}
            </select>
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Type your message..."
              rows={5}
              className="mt-3 flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={startThread}
                disabled={sending || !newRecipientId || !newBody.trim()}
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
            <EmptyState icon={MessageSquare} message="Select a conversation." />
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
              <p className="text-sm font-semibold text-ink">{selectedThread.otherWorkspaceName}</p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {threadMessages.length === 0 ? (
                <EmptyState icon={Send} message="No messages yet -- send one below to start the conversation." />
              ) : (
                threadMessages.map((m) => {
                  const mine = m.senderWorkspaceId === workspaceId;
                  const senderProfile = m.senderUserId ? senderProfiles[m.senderUserId] : undefined;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`flex max-w-[75%] items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                        <Avatar name={senderProfile?.display_name} url={senderProfile?.avatar_url} size="xs" />
                        <div className="flex flex-col">
                          {senderProfile?.display_name && (
                            <span className={`mb-0.5 px-1 text-[10px] font-medium text-muted ${mine ? "text-right" : "text-left"}`}>
                              {senderProfile.display_name}
                            </span>
                          )}
                          <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? "bg-accent text-white" : "bg-surfaceMuted text-slate"}`}>
                            <p className="whitespace-pre-wrap">{m.body}</p>
                            <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>
                              {new Date(m.createdAt).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-border p-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Type a message... (Enter for a new line, Cmd/Ctrl+Enter to send)"
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
