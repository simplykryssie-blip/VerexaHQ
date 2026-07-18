"use client";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
export default function NotificationsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const { data } = await supabase
      .from("v_my_notifications")
      .select("*")
      .eq("workspace_id", activeWorkspaceId)
      .order("created_at", { ascending: false })
      .limit(100);
    setRows(data ?? []);
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function read(id: string) {
    await supabase.rpc("mark_notification_read", { p_notification_id: id });
    void load();
  }
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Notifications</h1>
      <p className="mt-1 text-sm text-muted">
        Updates that need your attention.
      </p>
      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-line bg-white p-10 text-center text-muted">
            <Bell className="mx-auto mb-3" />
            You’re all caught up.
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              className={`flex gap-4 rounded-2xl border p-4 ${r.read_at ? "border-line bg-white" : "border-teal/30 bg-cyan-50/50"}`}
            >
              <Bell size={18} className="mt-1 shrink-0 text-[#108A64]" />
              <div className="flex-1">
                <div className="font-semibold text-ink">
                  {r.subject || r.event_code || "Notification"}
                </div>
                <p className="mt-1 text-sm text-muted">{r.body}</p>
                <div className="mt-2 text-xs text-muted">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {!r.read_at && (
                <button
                  onClick={() => read(r.id)}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white text-[#108A64]"
                  title="Mark read"
                >
                  <Check size={17} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
