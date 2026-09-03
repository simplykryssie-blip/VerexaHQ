"use client";

import { useEffect, useState } from "react";
import { PublicBookingFlow, type BookableService } from "@/components/booking/PublicBookingFlow";

type BookingWidgetConfig = {
  service_id?: string;
  staff_id?: string;
};

type Context = {
  workspaceName: string;
  services: BookableService[];
  staff: { id: string; name: string } | null;
  windowDays: number;
};

export function BookingWidgetSection({ config, workspaceSlug }: { config: BookingWidgetConfig; workspaceSlug: string }) {
  const [context, setContext] = useState<Context | null | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams({ workspaceSlug });
    if (config.staff_id) params.set("staffId", config.staff_id);
    fetch(`/api/public/booking/context?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setContext)
      .catch(() => setContext(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, config.staff_id]);

  if (context === undefined) return null;

  if (!context) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This booking widget isn&apos;t available</h1>
      </div>
    );
  }

  return (
    <PublicBookingFlow
      embedded
      workspaceSlug={workspaceSlug}
      workspaceName={context.workspaceName}
      services={context.services}
      preselectedServiceId={config.service_id ?? null}
      staffId={context.staff?.id ?? null}
      staffName={context.staff?.name ?? null}
      windowDays={context.windowDays}
    />
  );
}
