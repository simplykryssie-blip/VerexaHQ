"use client";

import { useState } from "react";
import { PageLibrary, type SitePageCard } from "./PageLibrary";
import { WebsiteSettings } from "./WebsiteSettings";
import { MediaLibrary } from "./MediaLibrary";

type Website = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  favicon_url: string | null;
  head_tracking_code: string | null;
  body_tracking_code: string | null;
};

const TABS = ["pages", "media", "settings"] as const;

export function WebsiteDetail({
  workspaceSlug,
  website,
  pages,
  canManage,
}: {
  workspaceSlug: string;
  website: Website;
  pages: SitePageCard[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pages");

  return (
    <div>
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium capitalize ${
              tab === t ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "pages" && (
          <PageLibrary
            workspaceId={website.workspace_id}
            workspaceSlug={workspaceSlug}
            websiteId={website.id}
            websiteSlug={website.slug}
            pages={pages}
            canManage={canManage}
          />
        )}
        {tab === "media" && <MediaLibrary workspaceId={website.workspace_id} websiteId={website.id} canManage={canManage} />}
        {tab === "settings" && <WebsiteSettings website={website} canManage={canManage} />}
      </div>
    </div>
  );
}
