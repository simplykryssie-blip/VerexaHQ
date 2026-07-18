"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
type Event = {
  id: string;
  title: string;
  date: string;
  kind: string;
  client_id: string | null;
};
export default function CalendarPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const start = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      1,
    ).toISOString();
    const end = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      1,
    ).toISOString();
    const [d, c] = await Promise.all([
      supabase
        .from("deadlines")
        .select("id,deadline_title,due_date,client_id")
        .eq("workspace_id", activeWorkspaceId)
        .gte("due_date", start.slice(0, 10))
        .lt("due_date", end.slice(0, 10)),
      supabase
        .from("workspace_calendar_events")
        .select("id,event_title,start_at,client_id,event_category")
        .eq("workspace_id", activeWorkspaceId)
        .gte("start_at", start)
        .lt("start_at", end),
    ]);
    setEvents([
      ...(d.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.deadline_title,
        date: r.due_date,
        kind: "Deadline",
        client_id: r.client_id,
      })),
      ...(c.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.event_title,
        date: r.start_at,
        kind: r.event_category || "Event",
        client_id: r.client_id,
      })),
    ]);
  }, [activeWorkspaceId, cursor]);
  useEffect(() => {
    void load();
  }, [load]);
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const a: (Date | null)[] = Array(first.getDay()).fill(null);
    for (let i = 1; i <= last.getDate(); i++)
      a.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
    while (a.length % 7) a.push(null);
    return a;
  }, [cursor]);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-muted">
            Deadlines and firm events in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1),
              )
            }
            className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white"
          >
            <ChevronLeft />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold"
          >
            Today
          </button>
          <button
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1),
              )
            }
            className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white"
          >
            <ChevronRight />
          </button>
        </div>
      </div>
      <h2 className="mb-3 text-lg font-bold text-ink">
        {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </h2>
      <div className="overflow-x-auto">
        <div className="min-w-[760px] overflow-hidden rounded-2xl border border-line bg-white">
          <div className="grid grid-cols-7 bg-paper">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div
                key={d}
                className="p-3 text-xs font-bold uppercase text-muted"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const items = day
                ? events.filter(
                    (e) =>
                      new Date(e.date).toDateString() === day.toDateString(),
                  )
                : [];
              return (
                <div
                  key={i}
                  className="min-h-28 border-r border-t border-line p-2 last:border-r-0"
                >
                  <div className="text-xs font-semibold text-muted">
                    {day?.getDate()}
                  </div>
                  {items.slice(0, 3).map((e) => (
                    <Link
                      key={`${e.kind}-${e.id}`}
                      href={
                        e.client_id ? `/clients/${e.client_id}` : "/deadlines"
                      }
                      className="mt-1 block truncate rounded-lg bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-800"
                    >
                      {e.title}
                    </Link>
                  ))}
                  {items.length > 3 && (
                    <div className="mt-1 text-[10px] text-muted">
                      +{items.length - 3} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
