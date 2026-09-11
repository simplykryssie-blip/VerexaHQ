import { PieChart } from "lucide-react";
import { WidgetShell } from "./WidgetShell";
import { EmptyState } from "./EmptyState";
import { Donut } from "./Donut";
import type { ServiceEngagementCount } from "@/lib/dashboard/data";

const MAX_SEGMENTS = 4;

export function TopServicesWidget({ services }: { services: ServiceEngagementCount[] }) {
  const total = services.reduce((sum, s) => sum + s.count, 0);

  if (total === 0) {
    return (
      <WidgetShell title="Top Services">
        <EmptyState icon={PieChart} message="No active engagements yet." />
      </WidgetShell>
    );
  }

  const top = services.slice(0, MAX_SEGMENTS);
  const otherCount = services.slice(MAX_SEGMENTS).reduce((sum, s) => sum + s.count, 0);
  const segments = (otherCount > 0 ? [...top, { serviceId: "other", name: "Other", count: otherCount }] : top).map((s) => ({
    id: s.serviceId,
    label: s.name,
    count: s.count,
  }));

  return (
    <WidgetShell title="Top Services">
      <Donut segments={segments} centerLabel={String(total)} centerSublabel="Total" />
    </WidgetShell>
  );
}
