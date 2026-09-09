"use client";

import { useState } from "react";
import { PageLibrary, type SitePageCard } from "./PageLibrary";
import { PopupLibrary, type PopupCard } from "./PopupLibrary";
import { WebsiteSettings } from "./WebsiteSettings";
import { MediaLibrary } from "./MediaLibrary";
import { Tabs } from "@/components/ui/Tabs";

type Website = {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  favicon_url: string | null;
  head_tracking_code: string | null;
  body_tracking_code: string | null;
  custom_domain: string | null;
  domain_verified: boolean;
  domain_verified_at: string | null;
};

const TABS = ["pages", "popups", "media", "settings"] as const;

export function WebsiteDetail({
  workspaceSlug,
  website,
  pages,
  popups,
  canManage,
}: {
  workspaceSlug: string;
  website: Website;
  pages: SitePageCard[];
  popups: PopupCard[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pages");

  return (
    <div>
      <Tabs
        tabs={TABS.map((t) => ({ id: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
        active={tab}
        onChange={(id) => setTab(id as (typeof TABS)[number])}
      />

      <div className="mt-4">
        {tab === "pages" && (
          <PageLibrary
            workspaceId={website.workspace_id}
            workspaceSlug={workspaceSlug}
            websiteId={website.id}
            websiteSlug={website.slug}
            customDomain={website.custom_domain}
            domainVerified={website.domain_verified}
            pages={pages}
            canManage={canManage}
          />
        )}
        {tab === "popups" && <PopupLibrary workspaceId={website.workspace_id} websiteId={website.id} popups={popups} canManage={canManage} />}
        {tab === "media" && <MediaLibrary workspaceId={website.workspace_id} canManage={canManage} />}
        {tab === "settings" && <WebsiteSettings website={website} canManage={canManage} />}
      </div>
    </div>
  );
}
