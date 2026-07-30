"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { outboxStatusLabel, outboxChannelLabel } from "@/lib/validation/notifications";
import { formatDateTime } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type OutboxRow = Tables<"communication_outbox"> & { client?: { first_name?: string | null; last_name?: string | null; company?: string | null } | null };

export function CommunicationOutboxRow({ item }: { item: OutboxRow }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Tables<"communication_events">[] | null>(null);
  const [loading, setLoading] = useState(false);
  const client = item.client;
  const clientName = client?.company || `${client?.first_name ?? ""} ${client?.last_name ?? ""}`.trim();

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && events === null) {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase.from("communication_events").select("*").eq("outbox_id", item.id).order("event_at", { ascending: true });
      setEvents(data ?? []);
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-accent">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{item.subject || item.body_text?.slice(0, 60) || "(no subject)"}</span>
            <Badge variant="outline" className="text-[10px]">
              {outboxChannelLabel(item.channel)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {clientName || item.recipient_address} · {formatDateTime(item.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={item.status === "failed" ? "destructive" : item.status === "delivered" || item.status === "sent" ? "success" : "secondary"}>
            {outboxStatusLabel(item.status)}
          </Badge>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {item.error_message && <p className="text-xs text-destructive mb-2">{item.error_message}</p>}
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading events…</p>
          ) : !events || events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No delivery events recorded yet.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded bg-secondary px-2 py-1">
                  <span>{e.event_type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">{formatDateTime(e.event_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
