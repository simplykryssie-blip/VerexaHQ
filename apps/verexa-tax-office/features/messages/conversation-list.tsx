"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDays } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Tables } from "@/types/database";

type ConversationRow = Tables<"conversations"> & {
  client?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
  unreadCount: number;
};

export function ConversationList({ conversations, activeId, search }: { conversations: ConversationRow[]; activeId?: string; search?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(search ?? "");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(query ? `/messages?search=${encodeURIComponent(query)}` : "/messages");
  }

  return (
    <div className="flex flex-col h-full border-r border-border">
      <form onSubmit={submitSearch} className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subject…" className="pl-8" />
        </div>
      </form>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">No conversations yet.</p>
        ) : (
          conversations.map((c) => {
            const clientName = c.client?.company || `${c.client?.first_name ?? ""} ${c.client?.last_name ?? ""}`.trim();
            const active = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/messages/${c.id}`}
                className={cn("block border-b border-border p-3 hover:bg-accent transition-colors", active && "bg-accent")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{clientName || "Unknown client"}</span>
                  {c.unreadCount > 0 && <Badge variant="default">{c.unreadCount}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{c.subject || "No subject"}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{formatRelativeDays(c.last_message_at ?? c.created_at)}</div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
