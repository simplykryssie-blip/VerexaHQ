"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

export type FunnelWithWebsite = { id: string; name: string; status: string; website_id: string; website_name: string; page_count: number };

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", published: "success", archived: "neutral" };

export function AllFunnelsLibrary({ funnels, websites }: { funnels: FunnelWithWebsite[]; websites: { id: string; name: string }[] }) {
  const router = useRouter();
  const [targetWebsiteId, setTargetWebsiteId] = useState(websites[0]?.id ?? "");

  return (
    <div>
      {websites.length > 0 && (
        <div className="flex items-end gap-2 rounded-2xl border border-dashed border-border p-4">
          <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
            Create a funnel in
            <select
              value={targetWebsiteId}
              onChange={(e) => setTargetWebsiteId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => router.push(`/websites/${targetWebsiteId}/funnels`)}
            disabled={!targetWebsiteId}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Go
          </button>
        </div>
      )}

      <div className="mt-4">
        {funnels.length === 0 ? (
          <EmptyState message="No funnels yet -- open a website and add one from its Funnels tab." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {funnels.map((f) => (
              <Link
                key={f.id}
                href={`/websites/${f.website_id}/funnels/${f.id}`}
                className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft hover:border-accent"
              >
                <h3 className="text-sm font-semibold text-ink">{f.name}</h3>
                <p className="mt-1 text-xs text-muted">{f.website_name}</p>
                <p className="mt-1 text-xs text-muted">
                  {f.page_count} page{f.page_count === 1 ? "" : "s"}
                </p>
                <div className="mt-3">
                  <Badge tone={STATUS_TONE[f.status] ?? "neutral"}>
                    <span className="capitalize">{f.status}</span>
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
