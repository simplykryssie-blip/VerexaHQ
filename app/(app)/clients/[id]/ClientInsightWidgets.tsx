import { HeartPulse, AlertTriangle, Sparkles } from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { Badge } from "@/components/ui/Badge";
import type { ClientWorkspaceProps } from "./ClientWorkspace";

// TaxFlowOS's "AI Client Health Score / Churn Prediction / Cross-Sell"
// widgets are opaque numbers with no stated basis. There's no historical
// outcome data in this schema to calibrate a real prediction against, so
// rather than fabricate a percentage, these compute an honest score from
// real signals already on the record (health) and list the actual signals
// themselves (risk) instead of a made-up probability. Cross-sell is a real
// catalog comparison, not a guess. All three are cheap synchronous math on
// data already loaded -- no "Analyzing..." delay, because there's nothing
// actually being analyzed that takes time.
type Insights = {
  healthScore: number;
  healthFactors: string[];
  riskSignals: string[];
  crossSell: string[];
};

function computeInsights(props: ClientWorkspaceProps): Insights {
  const { tasks, invoices, engagements, timeline, messages, workspaceServices, missingDocumentCount, interestedServiceIds } = props;
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const overdueTasks = tasks.filter((t) => t.due_date && new Date(t.due_date).getTime() < now).length;
  const overdueInvoices = invoices.filter((i) => i.status !== "paid" && i.due_date && new Date(i.due_date).getTime() < now).length;
  const missingDocuments = missingDocumentCount;
  const hasOpenEngagement = engagements.some((e) => e.status !== "Completed" && e.status !== "Archived");

  const lastContactAt = [...timeline.map((t) => t.created_at), ...messages.map((m) => m.created_at)].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  )[0];
  const daysSinceContact = lastContactAt ? Math.floor((now - new Date(lastContactAt).getTime()) / DAY) : null;

  let healthScore = 100;
  const healthFactors: string[] = [];
  const riskSignals: string[] = [];

  if (overdueTasks > 0) {
    healthScore -= Math.min(overdueTasks * 15, 30);
    healthFactors.push(`${overdueTasks} overdue task${overdueTasks === 1 ? "" : "s"}`);
    riskSignals.push(`${overdueTasks} overdue task${overdueTasks === 1 ? "" : "s"}`);
  }
  if (missingDocuments > 0) {
    healthScore -= Math.min(missingDocuments * 10, 20);
    healthFactors.push(`${missingDocuments} missing document${missingDocuments === 1 ? "" : "s"}`);
    riskSignals.push(`${missingDocuments} missing document${missingDocuments === 1 ? "" : "s"}`);
  }
  if (overdueInvoices > 0) {
    healthScore -= 20;
    healthFactors.push(`${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}`);
    riskSignals.push(`${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"}`);
  }
  if (daysSinceContact === null || daysSinceContact > 30) {
    healthScore -= 15;
    const label = daysSinceContact === null ? "No recorded contact yet" : `No activity in ${daysSinceContact} days`;
    healthFactors.push(label);
    riskSignals.push(label);
  }
  if (!hasOpenEngagement) {
    healthScore -= 10;
    healthFactors.push("No open engagement");
  }
  healthScore = Math.max(0, healthScore);
  if (healthFactors.length === 0) healthFactors.push("No issues found -- on track");

  // A service the client is already engaged for, or has already expressed
  // interest in (awaiting its own organizer/engagement automation), isn't a
  // fresh cross-sell -- suggesting it back is just noise.
  const currentServiceNames = new Set(engagements.map((e) => e.services?.name).filter((n): n is string => Boolean(n)));
  const interestedIds = new Set(interestedServiceIds);
  const crossSell = workspaceServices
    .filter((s) => !interestedIds.has(s.id))
    .map((s) => s.name)
    .filter((name) => !currentServiceNames.has(name))
    .slice(0, 3);

  return { healthScore, healthFactors, riskSignals, crossSell };
}

export function ClientInsightWidgets(props: ClientWorkspaceProps) {
  const { healthScore, healthFactors, riskSignals, crossSell } = computeInsights(props);
  const healthTone = healthScore >= 70 ? "success" : healthScore >= 40 ? "warning" : "danger";

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border p-5 sm:grid-cols-3">
      <SectionCard title="Client health" accent="emerald">
        <div className="flex items-center gap-3">
          <HeartPulse size={18} className="shrink-0 text-emerald" aria-hidden="true" />
          <span className="font-display text-2xl font-semibold text-ink">{healthScore}</span>
          <Badge tone={healthTone}>{healthTone === "success" ? "Healthy" : healthTone === "warning" ? "Needs attention" : "At risk"}</Badge>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {healthFactors.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Risk signals" accent="amber">
        {riskSignals.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <AlertTriangle size={16} className="shrink-0 text-muted" aria-hidden="true" /> None detected
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm text-slate">
            {riskSignals.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0 text-amber" aria-hidden="true" /> {s}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Cross-sell opportunities" accent="violet">
        {crossSell.length === 0 ? (
          <p className="text-sm text-muted">No other published services in the catalog to suggest.</p>
        ) : (
          <ul className="space-y-1.5 text-sm text-slate">
            {crossSell.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <Sparkles size={14} className="shrink-0 text-violet" aria-hidden="true" /> {name}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
