"use client";

import type { SitePageData } from "./types";
import { SectionRenderer } from "./SectionRenderer";
import { TrackingScripts } from "./TrackingScripts";

export function PublicSitePage({
  workspaceSlug,
  websiteSlug,
  data,
}: {
  workspaceSlug: string;
  websiteSlug: string;
  data: SitePageData;
}) {
  const { page, website, branding, funnel, sections } = data;
  const accentColor = branding?.secondary_color || branding?.primary_color || undefined;
  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="min-h-screen bg-white">
      <TrackingScripts headCode={website.head_tracking_code} bodyCode={website.body_tracking_code} />
      {branding?.logo_url && (
        <header className="border-b border-border px-6 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logo_url} alt={branding.display_name ?? page.title} className="h-8 w-auto" />
        </header>
      )}
      <main>
        {ordered.map((section) => (
          <SectionRenderer
            key={section.id}
            section={section}
            pageId={page.id}
            workspaceSlug={workspaceSlug}
            websiteSlug={websiteSlug}
            funnel={funnel}
            accentColor={accentColor}
            firmName={branding?.display_name ?? null}
          />
        ))}
      </main>
    </div>
  );
}
