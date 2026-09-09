"use client";

import Link from "next/link";
import type { SitePageData } from "./types";
import { SectionRenderer } from "./SectionRenderer";
import { TrackingScripts } from "./TrackingScripts";
import { PopupHost } from "./PopupHost";

export function PublicSitePage({
  workspaceSlug,
  websiteSlug,
  data,
  showLoginLink,
  previewMode,
}: {
  workspaceSlug: string;
  websiteSlug: string;
  data: SitePageData;
  // Only ever passed by app/page.tsx for Verexa's own marketing homepage --
  // this component is shared by every tenant firm's published website too,
  // and a link to Verexa's own staff login has no place on their sites.
  showLoginLink?: boolean;
  // Only ever passed by app/site-preview/[pageId]/page.tsx -- renders a
  // staff member's own unpublished draft through this exact same component
  // instead of a separate mockup, so "what will this look like once
  // published" is never a guess. Suppresses popups (an exit-intent or timed
  // popup firing while someone's just checking a draft would be confusing,
  // and its own form has the same real-submission risk as organizer_form)
  // and swaps a couple of section types for safe stand-ins -- see
  // SectionRenderer.tsx.
  previewMode?: boolean;
}) {
  const { page, website, branding, funnel, sections } = data;
  const accentColor = branding?.secondary_color || branding?.primary_color || undefined;
  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order);
  const loginLinkColor = website.header_background ? "#ffffff" : "inherit";

  // `background` (not `backgroundColor`) so a page can set a CSS gradient,
  // not just a flat color -- a plain hex value still works fine here too.
  return (
    <div className="min-h-screen" style={{ background: page.background_color || "#ffffff" }}>
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
            previewMode={previewMode}
            customCss={page.custom_css}
          />
        ))}
      </main>
      {!previewMode && (
        <PopupHost
          websiteId={website.id}
          pageId={page.id}
          workspaceSlug={workspaceSlug}
          websiteSlug={websiteSlug}
          accentColor={accentColor}
          firmName={branding?.display_name ?? null}
        />
      )}
    </div>
  );
}
