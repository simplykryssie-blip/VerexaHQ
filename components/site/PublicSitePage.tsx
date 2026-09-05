"use client";

import Link from "next/link";
import type { SitePageData } from "./types";
import { SectionRenderer } from "./SectionRenderer";
import { TrackingScripts } from "./TrackingScripts";
import { MkbHomePage } from "./mkb/MkbHomePage";

export function PublicSitePage({
  workspaceSlug,
  websiteSlug,
  pageSlug,
  data,
  showLoginLink,
}: {
  workspaceSlug: string;
  websiteSlug: string;
  pageSlug?: string;
  data: SitePageData;
  // Only ever passed by app/page.tsx for Verexa's own marketing homepage --
  // this component is shared by every tenant firm's published website too,
  // and a link to Verexa's own staff login has no place on their sites.
  showLoginLink?: boolean;
}) {
  const { page, website, branding, funnel, sections } = data;
  const accentColor = branding?.secondary_color || branding?.primary_color || undefined;
  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order);
  const loginLinkColor = website.header_background ? "#ffffff" : "inherit";

  if (workspaceSlug === "mkb-financial-group-llc" && websiteSlug === "mkb-financial-group" && pageSlug === "home") {
    return (
      <div className="min-h-screen overflow-x-hidden bg-black">
        <TrackingScripts headCode={website.head_tracking_code} bodyCode={website.body_tracking_code} />
        {page.schema_markup && (
          // eslint-disable-next-line react/no-danger
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: page.schema_markup }} />
        )}
        <MkbHomePage />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: page.background_color || "#ffffff" }}>
      <TrackingScripts headCode={website.head_tracking_code} bodyCode={website.body_tracking_code} />
      {page.custom_js && <TrackingScripts headCode={null} bodyCode={page.custom_js} />}
      {page.custom_css && <style dangerouslySetInnerHTML={{ __html: page.custom_css }} />}
      {page.schema_markup && (
        // eslint-disable-next-line react/no-danger
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: page.schema_markup }} />
      )}
      {(branding?.logo_url || showLoginLink) && (
        <header
          className={`flex items-center justify-between ${website.header_background ? "px-6 py-4" : "border-b border-border px-6 py-4"}`}
          style={website.header_background ? { background: website.header_background, borderBottom: "1px solid rgba(255,255,255,0.08)" } : undefined}
        >
          {branding?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt={branding.display_name ?? page.title} className="h-8 w-auto" />
          ) : (
            <span />
          )}
          {showLoginLink && (
            <Link href="/login" className="text-sm font-medium hover:underline" style={{ color: loginLinkColor }}>
              Log in
            </Link>
          )}
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
