"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDays } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type ConversationRow = Tables<"conversations"> & { unreadCount: number };

export function PortalConversationList({ conversations, activeId }: { conversations: ConversationRow[]; activeId?: string }) {
  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">No conversations yet.</p>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/portal/messages/${c.id}`}
                className={cn("block border-b border-border p-3 hover:bg-accent transition-colors", active && "bg-accent")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{c.subject || "Conversation"}</span>
                  {c.unreadCount > 0 && <Badge variant="default">{c.unreadCount}</Badge>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{formatRelativeDays(c.last_message_at ?? c.created_at)}</div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
