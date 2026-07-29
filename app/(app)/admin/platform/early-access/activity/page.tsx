"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/friendlyError";
import { useEarlyAccessDirectory } from "@/lib/earlyAccess/admin/useEarlyAccessDirectory";
import type { EarlyAccessActivityLog, EarlyAccessCampaign } from "@/lib/earlyAccess/types";

function shortId(id: string | null) {
  return id ? id.slice(0, 8) : "—";
}

const PAGE_SIZE = 50;

export default function ActivityLogPage() {
  const directory = useEarlyAccessDirectory();
  const [campaign, setCampaign] = useState<EarlyAccessCampaign | null>(null);
  const [logs, setLogs] = useState<EarlyAccessActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: campaignRow, error: campaignError } = await supabase
      .from("early_access_campaigns")
      .select("*")
      .eq("slug", "verexahq-v0-2-founding-firm-beta")
      .maybeSingle();
    if (campaignError || !campaignRow) {
      setError(friendlyError(campaignError, "Couldn't load the Early Access campaign."));
      setLoading(false);
      return;
    }
    const c = campaignRow as EarlyAccessCampaign;
    setCampaign(c);
    const { data, error: logsError } = await supabase
      .from("early_access_activity_logs")
      .select("*")
      .eq("campaign_id", c.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (logsError) {
      setError(friendlyError(logsError, "Couldn't load the activity log."));
      setLoading(false);
      return;
    }
    setLogs((data as EarlyAccessActivityLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actions = Array.from(new Set(logs.map((l) => l.action))).sort();
  const filtered = actionFilter === "all" ? logs : logs.filter((l) => l.action === actionFilter);

  if (loading) return <p className="text-muted">Loading activity…</p>;
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;
  if (!campaign) {
    return <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No Early Access campaign found.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Most recent {PAGE_SIZE} admin actions logged for this campaign.</p>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-xl border border-line px-3 py-2 text-sm">
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {a.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">No activity recorded yet.</div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold capitalize text-ink">{l.action.replaceAll("_", " ")}</td>
                  <td className="px-4 py-3 text-muted">
                    {l.entity_type}
                    {l.entity_id && <span className="ml-1 font-mono text-xs">{shortId(l.entity_id)}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{directory.userName(l.actor_user_id)}</td>
                  <td className="px-4 py-3 text-xs text-muted">{directory.workspaceName(l.workspace_id)}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-xs text-muted" title={JSON.stringify(l.details)}>
                    {Object.keys(l.details ?? {}).length > 0 ? JSON.stringify(l.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
