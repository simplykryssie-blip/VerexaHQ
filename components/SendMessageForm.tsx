"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { ActionPermissions } from "@/lib/actionPermissions";

export function SendMessageForm({
  workspaceId,
  entityType,
  entityId,
  primaryEmail,
  primaryPhone,
  permissions,
  onSent,
}: {
  workspaceId: string;
  entityType: "client" | "engagement";
  entityId: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  permissions: ActionPermissions;
  onSent: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const channelOptions = [
    ...(permissions.messagesSend
      ? [
          { value: "portal", label: "Client portal inbox" },
          { value: "email", label: `Email${primaryEmail ? ` (${primaryEmail})` : " -- no email on file"}` },
          { value: "sms", label: `SMS${primaryPhone ? ` (${primaryPhone})` : " -- no phone on file"}` },
        ]
      : []),
    ...(permissions.messagesInternalNote ? [{ value: "internal", label: "Internal note (staff only)" }] : []),
  ];
  const [channel, setChannel] = useState(channelOptions[0]?.value ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const isInternal = channel === "internal";
  const isEmail = channel === "email";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (channel === "email" && !primaryEmail) {
      setError("No email on file -- add one in Contacts first.");
      return;
    }
    if (channel === "sms" && !primaryPhone) {
      setError("No phone number on file -- add one in Contacts first.");
      return;
    }
    if (!body.trim()) {
      setError("Enter a message.");
      return;
    }
    setSending(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const threadSubject = isInternal ? "Internal note" : subject.trim() || "Message";
    const { data: thread, error: threadError } = await supabase
      .from("message_threads")
      .insert({
        workspace_id: workspaceId,
        entity_type: entityType,
        entity_id: entityId,
        channel: isInternal ? "internal" : channel,
        subject: threadSubject,
        created_by: user?.id,
      })
      .select("id")
      .single();
    if (threadError || !thread) {
      setSending(false);
      setError(threadError?.message ?? "Could not create thread.");
      return;
    }
    const { error: messageError } = await supabase.from("messages").insert({
      workspace_id: workspaceId,
      thread_id: thread.id,
      sender_type: "staff",
      sender_id: user?.id,
      body,
      is_internal: isInternal,
    });
    if (messageError) {
      setSending(false);
      setError(messageError.message);
      return;
    }

    if (channel === "email" && primaryEmail) {
      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: primaryEmail, subject: threadSubject, html: `<p>${body}</p>` }),
        });
        const data = (await res.json()) as { sent?: boolean; reason?: string; error?: string };
        if (!data.sent) {
          toast.show(`Message saved, but the email wasn't delivered: ${data.reason ?? data.error ?? "unknown error"}`, "error");
        } else {
          toast.show("Message sent", "success");
        }
      } catch {
        toast.show("Message saved, but the email wasn't delivered.", "error");
      }
    } else if (channel === "sms" && primaryPhone) {
      try {
        const res = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: primaryPhone, body }),
        });
        const data = (await res.json()) as { sent?: boolean; reason?: string; error?: string };
        if (!data.sent) {
          toast.show(`Message saved, but the SMS wasn't delivered: ${data.reason ?? data.error ?? "unknown error"}`, "error");
        } else {
          toast.show("Message sent", "success");
        }
      } catch {
        toast.show("Message saved, but the SMS wasn't delivered.", "error");
      }
    } else {
      toast.show(isInternal ? "Note saved" : "Message saved", "success");
    }

    setSending(false);
    onSent();
    router.refresh();
  }

  return (
    <form onSubmit={send} className="space-y-3">
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {channelOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {!isInternal && (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Message"
        rows={isEmail ? 10 : 3}
        className="w-full resize-y rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onSent} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={sending}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
