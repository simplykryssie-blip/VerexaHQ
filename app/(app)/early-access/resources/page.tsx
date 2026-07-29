"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, ShieldCheck, HelpCircle, ListChecks, AlertTriangle, LifeBuoy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { friendlyError } from "@/lib/friendlyError";
import type { EarlyAccessResource, ResourceType } from "@/lib/earlyAccess/types";

const TYPE_ICON: Record<ResourceType, typeof BookOpen> = {
  guide: BookOpen,
  policy: ShieldCheck,
  faq: HelpCircle,
  checklist: ListChecks,
  known_issues: AlertTriangle,
  support: LifeBuoy,
};

export default function WorkspaceResourcesPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { loading: membershipLoading, inProgram, campaign } = useEarlyAccessMembership(activeWorkspaceId);
  const [resources, setResources] = useState<EarlyAccessResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!campaign) return;
    setLoading(true);
    setError(null);
    const { data, error: resourcesError } = await supabase
      .from("early_access_resources")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true });
    if (resourcesError) {
      setError(friendlyError(resourcesError, "Couldn't load resources."));
      setLoading(false);
      return;
    }
    setResources((data as EarlyAccessResource[]) ?? []);
    setLoading(false);
  }, [campaign]);

  useEffect(() => {
    void load();
  }, [load]);

  if (membershipLoading || loading) return <p className="text-muted">Loading…</p>;
  if (!inProgram || !campaign) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
        Resources are available once your workspace has joined an Early Access program.
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-brick/30 bg-brick/10 px-4 py-3 text-sm text-brick">{error}</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Resources</h1>
      <p className="mt-1 text-sm text-muted">Guides, policies, and reference material for {campaign.name}.</p>

      {resources.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-white p-10 text-center text-sm text-muted">
          No resources have been published yet.
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {resources.map((r) => {
            const Icon = TYPE_ICON[r.resource_type];
            const open = openId === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-line bg-white">
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-[#108A64]">
                    <Icon size={17} />
                  </div>
                  <span className="flex-1 font-semibold text-ink">{r.title}</span>
                  <span className="text-xs capitalize text-muted">{r.resource_type.replaceAll("_", " ")}</span>
                </button>
                {open && (
                  <div className="whitespace-pre-wrap border-t border-line px-4 py-4 text-sm text-ink">{r.content}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
