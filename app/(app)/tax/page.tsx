import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { buildEntityLabelMap, clientLabel } from "@/lib/documentEntityLabels";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "returns", label: "Return Status" },
  { key: "reviewer-queue", label: "Reviewer Queue" },
  { key: "notices", label: "IRS Notices" },
  { key: "extensions", label: "Extensions" },
  { key: "tax-years", label: "Tax Year Metrics" },
  { key: "preparers", label: "Preparer Metrics" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const EFILE_LABEL: Record<string, string> = {
  not_filed: "Not filed",
  ready_to_file: "Ready to file",
  transmitted: "Transmitted",
  accepted: "Accepted",
  rejected: "Rejected",
  paper_filed: "Paper filed",
};

export default async function TaxOfficePage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const activeTab: TabKey = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as TabKey) : "returns";

  const supabase = createClient();

  const tabNav = (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-8">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/tax?tab=${t.key}`}
          className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
            activeTab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (activeTab === "returns") {
    const { data: rows } = await supabase
      .from("engagement_tax_details")
      .select("engagement_id, tax_year, return_type, efile_status, is_extended, engagements(id, engagement_number, status, due_date, client_id, clients(first_name, last_name, business_name, client_type))")
      .order("tax_year", { ascending: false });

    return (
      <>
        <PageHeader title="Tax Office" description="Return status, review queue, notices, and season metrics." />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {(rows ?? []).length === 0 ? (
            <EmptyState message="No tax details recorded yet -- fill them in from an engagement's Tax tab." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 text-left font-medium">Client</th>
                    <th className="px-4 py-2 text-left font-medium">Return</th>
                    <th className="px-4 py-2 text-left font-medium">Tax year</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">E-file</th>
                    <th className="px-4 py-2 text-left font-medium">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(rows ?? []).map((r) => {
                    const e = r.engagements as unknown as {
                      id: string;
                      engagement_number: string | null;
                      status: string;
                      due_date: string | null;
                      clients: { first_name: string | null; last_name: string | null; business_name: string | null; client_type: string } | null;
                    } | null;
                    if (!e) return null;
                    return (
                      <tr key={r.engagement_id} className="hover:bg-surfaceMuted">
                        <td className="px-4 py-2">
                          <Link href={`/engagements/${e.id}`} className="font-medium text-accent hover:underline">
                            {clientLabel(e.clients)}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-slate">
                          {r.return_type ?? "--"} {r.is_extended && <span className="text-xs text-warning">(extended)</span>}
                        </td>
                        <td className="px-4 py-2 text-slate">{r.tax_year ?? "--"}</td>
                        <td className="px-4 py-2 text-slate capitalize">{e.status}</td>
                        <td className="px-4 py-2 text-slate">{EFILE_LABEL[r.efile_status] ?? r.efile_status}</td>
                        <td className="px-4 py-2 text-slate">{e.due_date ? new Date(e.due_date).toLocaleDateString() : "--"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  if (activeTab === "reviewer-queue") {
    const { data: rows } = await supabase.from("v_reviewer_queue").select("*").eq("workspace_id", workspace.id);
    const clientIds = Array.from(new Set((rows ?? []).map((r) => r.client_id).filter((v): v is string => Boolean(v))));
    const { data: clients } =
      clientIds.length > 0
        ? await supabase.from("clients").select("id, first_name, last_name, business_name, client_type").in("id", clientIds)
        : { data: [] as { id: string; first_name: string | null; last_name: string | null; business_name: string | null; client_type: string }[] };
    const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

    return (
      <>
        <PageHeader title="Tax Office" description="Return status, review queue, notices, and season metrics." />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {(rows ?? []).length === 0 ? (
            <EmptyState message="Nothing is waiting on a reviewer right now." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {(rows ?? []).map((r) => {
                const overdue = r.due_date && new Date(r.due_date) < new Date();
                return (
                  <li key={r.workflow_stage_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <Link href={`/engagements/${r.engagement_id}`} className="font-medium text-accent hover:underline">
                        {clientLabel(clientById.get(r.client_id ?? "") ?? null)}
                      </Link>
                      <p className="text-xs text-muted">
                        {r.engagement_number} -- {r.stage_name}
                      </p>
                    </div>
                    <span className={`text-xs capitalize ${overdue ? "text-danger" : "text-muted"}`}>
                      {r.status}
                      {r.due_date && ` -- due ${new Date(r.due_date).toLocaleDateString()}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </>
    );
  }

  if (activeTab === "notices") {
    const { data: notices } = await supabase
      .from("irs_notices")
      .select("id, entity_type, entity_id, notice_type, notice_date, response_due_date, status")
      .eq("workspace_id", workspace.id)
      .order("notice_date", { ascending: false });
    const labelMap = await buildEntityLabelMap(supabase, notices ?? []);

    return (
      <>
        <PageHeader title="Tax Office" description="Return status, review queue, notices, and season metrics." />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {(notices ?? []).length === 0 ? (
            <EmptyState message="No IRS notices on file." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {(notices ?? []).map((n) => {
                const entity = labelMap.get(`${n.entity_type}:${n.entity_id}`);
                const overdue = n.status === "open" && n.response_due_date && new Date(n.response_due_date) < new Date();
                return (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <Link href={entity?.href ?? "#"} className="font-medium text-accent hover:underline">
                        {entity?.label ?? "--"}
                      </Link>
                      <p className="text-xs text-muted">
                        {n.notice_type} -- {new Date(n.notice_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-xs capitalize ${overdue ? "text-danger" : "text-muted"}`}>{n.status}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </>
    );
  }

  if (activeTab === "extensions") {
    const { data: rows } = await supabase
      .from("engagement_tax_details")
      .select("engagement_id, tax_year, extension_filed_date, extension_due_date, engagements(id, engagement_number, clients(first_name, last_name, business_name, client_type))")
      .eq("is_extended", true)
      .order("extension_due_date", { ascending: true });

    return (
      <>
        <PageHeader title="Tax Office" description="Return status, review queue, notices, and season metrics." />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {(rows ?? []).length === 0 ? (
            <EmptyState message="No extended returns on file." />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {(rows ?? []).map((r) => {
                const e = r.engagements as unknown as {
                  id: string;
                  engagement_number: string | null;
                  clients: { first_name: string | null; last_name: string | null; business_name: string | null; client_type: string } | null;
                } | null;
                if (!e) return null;
                const overdue = r.extension_due_date && new Date(r.extension_due_date) < new Date();
                return (
                  <li key={r.engagement_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <Link href={`/engagements/${e.id}`} className="font-medium text-accent hover:underline">
                        {clientLabel(e.clients)}
                      </Link>
                      <p className="text-xs text-muted">Tax year {r.tax_year ?? "--"}</p>
                    </div>
                    <span className={`text-xs ${overdue ? "text-danger" : "text-muted"}`}>
                      {r.extension_due_date ? `Due ${new Date(r.extension_due_date).toLocaleDateString()}` : "No due date set"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </>
    );
  }

  if (activeTab === "tax-years") {
    const { data: rows } = await supabase.from("v_tax_season_metrics").select("*").eq("workspace_id", workspace.id).order("tax_year", { ascending: false });

    return (
      <>
        <PageHeader title="Tax Office" description="Return status, review queue, notices, and season metrics." />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {(rows ?? []).length === 0 ? (
            <EmptyState message="No tax-year data yet." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 text-left font-medium">Tax year</th>
                    <th className="px-4 py-2 text-right font-medium">Total returns</th>
                    <th className="px-4 py-2 text-right font-medium">Accepted</th>
                    <th className="px-4 py-2 text-right font-medium">Rejected</th>
                    <th className="px-4 py-2 text-right font-medium">Transmitted</th>
                    <th className="px-4 py-2 text-right font-medium">Not filed</th>
                    <th className="px-4 py-2 text-right font-medium">Extended</th>
                    <th className="px-4 py-2 text-right font-medium">Amended</th>
                    <th className="px-4 py-2 text-right font-medium">Open notices</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(rows ?? []).map((r) => (
                    <tr key={r.tax_year} className="hover:bg-surfaceMuted">
                      <td className="px-4 py-2 font-medium text-ink">{r.tax_year}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.total_returns}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.accepted}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.rejected}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.transmitted}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.not_filed}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.extended}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.amended}</td>
                      <td className="px-4 py-2 text-right text-slate">{r.open_irs_notices}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  // preparers
  const { data: rows } = await supabase.from("v_staff_productivity").select("*").eq("workspace_id", workspace.id);
  const staffIds = (rows ?? []).map((r) => r.staff_id).filter((v): v is string => Boolean(v));
  const { data: staff } =
    staffIds.length > 0
      ? await supabase.from("user_profiles").select("id, display_name").in("id", staffIds)
      : { data: [] as { id: string; display_name: string | null }[] };
  const staffById = new Map((staff ?? []).map((s) => [s.id, s.display_name]));

  return (
    <>
      <PageHeader title="Tax Office" description="Return status, review queue, notices, and season metrics." />
      {tabNav}
      <div className="flex-1 px-8 py-6">
        {(rows ?? []).length === 0 ? (
          <EmptyState message="No staff productivity data yet." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 text-left font-medium">Preparer</th>
                  <th className="px-4 py-2 text-right font-medium">Open engagements</th>
                  <th className="px-4 py-2 text-right font-medium">Completed this month</th>
                  <th className="px-4 py-2 text-right font-medium">Tasks completed</th>
                  <th className="px-4 py-2 text-right font-medium">Tasks overdue</th>
                  <th className="px-4 py-2 text-right font-medium">Pending reviews</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(rows ?? []).map((r) => (
                  <tr key={r.staff_id} className="hover:bg-surfaceMuted">
                    <td className="px-4 py-2 font-medium text-ink">{staffById.get(r.staff_id ?? "") ?? "Unknown"}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.open_engagements}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.engagements_completed_this_month}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.tasks_completed}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.tasks_overdue}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.pending_reviews}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
