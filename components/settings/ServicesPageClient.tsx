"use client";

import { useState } from "react";
import { Copy, Package } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { Button } from "@/components/ui/Button";
import { ServiceLibrary, type ServiceCard, type ServiceCategoryOption } from "@/components/settings/ServiceLibrary";

export function ServicesPageClient({
  workspaceId,
  workspaceSlug,
  services,
  categories,
  canManage,
}: {
  workspaceId: string;
  workspaceSlug: string;
  services: ServiceCard[];
  categories: ServiceCategoryOption[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const generalBookingLink = typeof window !== "undefined" ? `${window.location.origin}/book/${workspaceSlug}` : "";

  function copyGeneralBookingLink() {
    navigator.clipboard.writeText(generalBookingLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="max-w-4xl">
      <SettingsSectionHeader
        icon={Package}
        title="Services"
        description="What your firm offers. Each service routes to a pipeline and an organizer -- pricing, document templates, and other details are optional and tucked under Advanced."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              + New service
            </Button>
          )
        }
      />

      <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink">General booking link</p>
        <p className="mt-1 text-[11px] text-muted">
          Share this when the client doesn&apos;t know which service they want yet -- they&apos;ll pick one, then a
          time. For a client who already knows what they want, copy that specific service&apos;s own link from its
          settings page below instead.
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <input
            readOnly
            value={generalBookingLink}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={copyGeneralBookingLink}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-muted hover:border-accent hover:text-accent"
          >
            <Copy size={13} /> {linkCopied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <ServiceLibrary
          workspaceId={workspaceId}
          services={services}
          categories={categories}
          canManage={canManage}
          creating={creating}
          onCreatingChange={setCreating}
        />
      </div>
    </div>
  );
}
