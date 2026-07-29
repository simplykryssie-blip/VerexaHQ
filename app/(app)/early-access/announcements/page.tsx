"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { friendlyError } from "@/lib/friendlyError";
import type { AnnouncementType, EarlyAccessAnnouncement } from "@/lib/earlyAccess/types";

const TYPE_STYLE: Record<AnnouncementType, string> = {
  general: "bg-blue-50 text-blue-700",
  release: "bg-emerald-50 text-emerald-700",
  maintenance: "bg-amber-50 text-amber-700",
  known_issue: "bg-purple-50 text-purple-700",
  urgent: "bg-brick/10 text-brick",
};

export default function WorkspaceAnnouncementsPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading: membershipLoading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const [announcements, setAnnouncements] = useState<EarlyAccessAnnouncement[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!campaign || !activeWorkspaceId) return;
    setLoading(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { data, error: annError } = await supabase
      .from("early_access_announcements")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (annError) {
      setError(friendlyError(annError, "Couldn't load announcements."));
      setLoading(false);
      return;
    }
    const list = (data as EarlyAccessAnnouncement[]) ?? [];
    setAnnouncements(list);

    if (userId && list.length > 0) {
      const { data: reads } = await supabase
        .from("early_access_announcement_reads")
        .select("announcement_id")
        .eq("user_id", userId)
        .in("announcement_id", list.map((a) => a.id));
      setReadIds(new Set((reads ?? []).map((r) => r.announcement_id as string)));
    }
    setLoading(false);
  }, [campaign, activeWorkspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(a: EarlyAccessAnnouncement) {
    if (!activeWorkspaceId || readIds.has(a.id)) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { error: insertError } = await supabase
      .from("early_access_announcement_reads")
      .insert({ announcement_id: a.id, workspace_id: activeWorkspaceId, user_id: userId });
    if (!insertError) {
      setReadIds((prev) => new Set(prev).add(a.id));
    }
  }

  if (membershipLoading || loading) return <p className="text-muted">Loading…</p>;
  if (!inProgram || !campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Announcements are available once your workspace has joined an Early Access program.
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Announcements</h1>
      <p className="mt-1 text-sm text-muted">Updates from the VerexaHQ team about {campaign.name}.</p>

      {announcements.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No announcements yet.
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {announcements.map((a) => {
            const isRead = readIds.has(a.id);
            return (
              <div
                key={a.id}
                onClick={() => markRead(a)}
                className={`cursor-pointer rounded-2xl border p-4 ${isRead ? "border-line bg-white" : "border-[#108A64] bg-emerald-50/40"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-[#108A64]" />}
                  <span className="font-semibold text-ink">{a.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${TYPE_STYLE[a.announcement_type]}`}>
                    {a.announcement_type.replaceAll("_", " ")}
                  </span>
                  {a.version_label && <span className="text-xs text-muted">{a.version_label}</span>}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{a.body}</p>
                {a.published_at && (
                  <p className="mt-2 text-xs text-muted">{new Date(a.published_at).toLocaleString()}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
