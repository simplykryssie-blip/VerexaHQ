"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PublicOrganizerForm, type OrganizerSubmitConfig } from "@/components/organizer/PublicOrganizerForm";
import type { SiteFunnel } from "../types";

type OrganizerFormConfig = {
  template_id?: string;
  public_token?: string;
  template_name?: string;
  on_submit?: OrganizerSubmitConfig;
};

export function OrganizerFormSection({
  config,
  pageId,
  workspaceSlug,
  websiteSlug,
  funnel,
}: {
  config: OrganizerFormConfig;
  pageId: string;
  workspaceSlug: string;
  websiteSlug: string;
  funnel: SiteFunnel;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [data, setData] = useState<unknown>(undefined);

  useEffect(() => {
    if (!config.public_token) {
      setData(null);
      return;
    }
    supabase.rpc("get_public_organizer_template", { p_token: config.public_token }).then(({ data }) => {
      setData(data ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.public_token]);

  function onNextPage() {
    if (!funnel) return;
    const currentIndex = funnel.pages.findIndex((p) => p.id === pageId);
    const nextPage = currentIndex >= 0 ? funnel.pages[currentIndex + 1] : undefined;
    if (nextPage) router.push(`/site/${workspaceSlug}/${websiteSlug}/${nextPage.slug}`);
  }

  if (data === undefined) return null;

  if (!config.public_token || !data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This form isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been turned off, or is still a draft.</p>
      </div>
    );
  }

  return <PublicOrganizerForm token={config.public_token} data={data as never} onSubmitConfig={config.on_submit} onNextPage={onNextPage} />;
}
