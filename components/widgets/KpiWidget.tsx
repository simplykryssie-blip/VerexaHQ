import { WidgetShell } from "./WidgetShell";

export function KpiWidget({
  title,
  value,
  tone = "default",
  reportHref,
}: {
  title: string;
  value: string;
  tone?: "default" | "warning" | "danger";
  reportHref?: string;
}) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink";
  return (
    <WidgetShell title={title} reportHref={reportHref}>
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
    </WidgetShell>
  );
}
