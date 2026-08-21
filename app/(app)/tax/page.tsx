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

const EROLike = new Set(["ero_office", "service_bureau"]);

export default async function TaxOfficePage({ searchParams }: { searchParams: { tab?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  const activeTab: TabKey = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as TabKey) : "returns";

  const supabase = createClient();

  // An ERO/SB admin sees Return Status, IRS Notices, Extensions, and Tax
  // Year Metrics rolled up across every connected PTIN firm, not just their
  // own workspace -- via narrow SECURITY DEFINER RPCs that re-validate admin
  // status before touching another workspace's rows. Everyone else (and any
  // non-admin) sees only their own workspace's data, same as before.
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  const showsNetworkRollup = Boolean(isAdmin) && EROLike.has(workspace.workspace_type);

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

  const description = showsNetworkRollup
    ? "Return status, review queue, notices, and season metrics -- rolled up across your firm and every connected PTIN."
    : "Return status, review queue, notices, and season metrics.";

  if (activeTab === "returns") {
    type ReturnRow = {
      firmName: string | null;
      engagementId: string;
      engagementNumber: string | null;
      status: string;
      dueDate: string | null;
      taxYear: number | null;
      returnType: string | null;
      efileStatus: string;
      isExtended: boolean;
      federalRefund: number | null;
      federalBalance: number | null;
      clientName: string;
    };

    let rows: ReturnRow[];
    if (showsNetworkRollup) {
      const { data } = await supabase.rpc("get_ero_return_status", { p_workspace_id: workspace.id });
      rows = (data ?? []).map((r) => ({
        firmName: r.source_workspace_id === workspace.id ? "Your firm" : r.source_workspace_name,
        engagementId: r.engagement_id,
        engagementNumber: r.engagement_number,
        status: r.status,
        dueDate: r.due_date,
        taxYear: r.tax_year,
        returnType: r.return_type,
        efileStatus: r.efile_status,
        isExtended: r.is_extended,
        federalRefund: r.federal_refund_amount,
        federalBalance: r.federal_balance_due,
        clientName: clientLabel({ client_type: r.client_type, first_name: r.client_first_name, last_name: r.client_last_name, business_name: r.client_business_name }),
      }));
    } else {
      const { data } = await supabase
        .from("engagement_tax_details")
        .select(
          "engagement_id, tax_year, return_type, efile_status, is_extended, federal_refund_amount, federal_balance_due, engagements(id, engagement_number, status, due_date, client_id, clients(first_name, last_name, business_name, client_type))"
        )
        .order("tax_year", { ascending: false });
      rows = (data ?? [])
        .map((r) => {
          const e = r.engagements as unknown as {
            id: string;
            engagement_number: string | null;
            status: string;
            due_date: string | null;
            clients: { first_name: string | null; last_name: string | null; business_name: string | null; client_type: string } | null;
          } | null;
          if (!e) return null;
          const row: ReturnRow = {
            firmName: null,
            engagementId: e.id,
            engagementNumber: e.engagement_number,
            status: e.status,
            dueDate: e.due_date,
            taxYear: r.tax_year,
            returnType: r.return_type,
            efileStatus: r.efile_status,
            isExtended: r.is_extended,
            federalRefund: r.federal_refund_amount,
            federalBalance: r.federal_balance_due,
            clientName: clientLabel(e.clients),
          };
          return row;
        })
        .filter((r): r is ReturnRow => r !== null);
    }

    return (
      <>
        <PageHeader title="Tax Office" description={description} />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {rows.length === 0 ? (
            <EmptyState message="No tax details recorded yet -- fill them in from an engagement's Tax tab." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
                    {showsNetworkRollup && <th className="px-4 py-2 text-left font-medium">Firm</th>}
                    <th className="px-4 py-2 text-left font-medium">Client</th>
                    <th className="px-4 py-2 text-left font-medium">Return</th>
                    <th className="px-4 py-2 text-left font-medium">Tax year</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">E-file</th>
                    <th className="px-4 py-2 text-left font-medium">Refund / Balance</th>
                    <th className="px-4 py-2 text-left font-medium">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.engagementId} className="hover:bg-surfaceMuted">
                      {showsNetworkRollup && <td className="px-4 py-2 text-slate">{r.firmName}</td>}
                      <td className="px-4 py-2">
                        <Link href={`/engagements/${r.engagementId}`} className="font-medium text-accent hover:underline">
                          {r.clientName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate">
                        {r.returnType ?? "--"} {r.isExtended && <span className="text-xs text-warning">(extended)</span>}
                      </td>
                      <td className="px-4 py-2 text-slate">{r.taxYear ?? "--"}</td>
                      <td className="px-4 py-2 text-slate capitalize">{r.status}</td>
                      <td className="px-4 py-2 text-slate">{EFILE_LABEL[r.efileStatus] ?? r.efileStatus}</td>
                      <td className="px-4 py-2 text-slate">
                        {r.federalRefund ? (
                          <span className="text-success">+${Number(r.federalRefund).toLocaleString()}</span>
                        ) : r.federalBalance ? (
                          <span className="text-danger">-${Number(r.federalBalance).toLocaleString()}</span>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate">{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "--"}</td>
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
        <PageHeader title="Tax Office" description={description} />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {(rows ?? []).length === 0 ? (
            <EmptyState message="Nothing is waiting on a reviewer right now." />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
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
    type NoticeRow = {
      id: string;
      firmName: string | null;
      noticeType: string;
      noticeDate: string;
      responseDueDate: string | null;
      status: string;
      label: string;
      href: string | null;
    };

    let rows: NoticeRow[];
    if (showsNetworkRollup) {
      const { data } = await supabase.rpc("get_ero_irs_notices", { p_workspace_id: workspace.id });
      rows = (data ?? []).map((n) => ({
        id: n.notice_id,
        firmName: n.source_workspace_id === workspace.id ? "Your firm" : n.source_workspace_name,
        noticeType: n.notice_type,
        noticeDate: n.notice_date,
        responseDueDate: n.response_due_date,
        status: n.status,
        label: n.entity_label,
        href: null,
      }));
    } else {
      const { data: notices } = await supabase
        .from("irs_notices")
        .select("id, entity_type, entity_id, notice_type, notice_date, response_due_date, status")
        .eq("workspace_id", workspace.id)
        .order("notice_date", { ascending: false });
      const labelMap = await buildEntityLabelMap(supabase, notices ?? []);
      rows = (notices ?? []).map((n) => {
        const entity = labelMap.get(`${n.entity_type}:${n.entity_id}`);
        return {
          id: n.id,
          firmName: null,
          noticeType: n.notice_type,
          noticeDate: n.notice_date,
          responseDueDate: n.response_due_date,
          status: n.status,
          label: entity?.label ?? "--",
          href: entity?.href ?? null,
        };
      });
    }

    return (
      <>
        <PageHeader title="Tax Office" description={description} />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {rows.length === 0 ? (
            <EmptyState message="No IRS notices on file." />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
              {rows.map((n) => {
                const overdue = n.status === "open" && n.responseDueDate && new Date(n.responseDueDate) < new Date();
                return (
                  <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      {n.href ? (
                        <Link href={n.href} className="font-medium text-accent hover:underline">
                          {n.label}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate">
                          {n.label}
                          {n.firmName && <span className="ml-1.5 text-xs text-muted">({n.firmName})</span>}
                        </span>
                      )}
                      <p className="text-xs text-muted">
                        {n.noticeType} -- {new Date(n.noticeDate).toLocaleDateString()}
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
    type ExtensionRow = {
      engagementId: string;
      firmName: string | null;
      taxYear: number | null;
      extensionDueDate: string | null;
      clientName: string;
    };

    let rows: ExtensionRow[];
    if (showsNetworkRollup) {
      const { data } = await supabase.rpc("get_ero_extensions", { p_workspace_id: workspace.id });
      rows = (data ?? []).map((r) => ({
        engagementId: r.engagement_id,
        firmName: r.source_workspace_id === workspace.id ? "Your firm" : r.source_workspace_name,
        taxYear: r.tax_year,
        extensionDueDate: r.extension_due_date,
        clientName: clientLabel({ client_type: r.client_type, first_name: r.client_first_name, last_name: r.client_last_name, business_name: r.client_business_name }),
      }));
    } else {
      const { data } = await supabase
        .from("engagement_tax_details")
        .select("engagement_id, tax_year, extension_filed_date, extension_due_date, engagements(id, engagement_number, clients(first_name, last_name, business_name, client_type))")
        .eq("is_extended", true)
        .order("extension_due_date", { ascending: true });
      rows = (data ?? [])
        .map((r) => {
          const e = r.engagements as unknown as {
            id: string;
            engagement_number: string | null;
            clients: { first_name: string | null; last_name: string | null; business_name: string | null; client_type: string } | null;
          } | null;
          if (!e) return null;
          const row: ExtensionRow = {
            engagementId: e.id,
            firmName: null,
            taxYear: r.tax_year,
            extensionDueDate: r.extension_due_date,
            clientName: clientLabel(e.clients),
          };
          return row;
        })
        .filter((r): r is ExtensionRow => r !== null);
    }

    return (
      <>
        <PageHeader title="Tax Office" description={description} />
        {tabNav}
        <div className="flex-1 px-8 py-6">
          {rows.length === 0 ? (
            <EmptyState message="No extended returns on file." />
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
              {rows.map((r) => {
                const overdue = r.extensionDueDate && new Date(r.extensionDueDate) < new Date();
                return (
                  <li key={r.engagementId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <div>
                      <Link href={`/engagements/${r.engagementId}`} className="font-medium text-accent hover:underline">
                        {r.clientName}
                      </Link>
                      <p className="text-xs text-muted">
                        Tax year {r.taxYear ?? "--"}
                        {r.firmName && ` -- ${r.firmName}`}
                      </p>
                    </div>
                    <span className={`text-xs ${overdue ? "text-danger" : "text-muted"}`}>
                      {r.extensionDueDate ? `Due ${new Date(r.extensionDueDate).toLocaleDateString()}` : "No due date set"}
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

  // tax-years
  type YearRow = {
    key: string;
    firmName: string | null;
    taxYear: number;
    totalReturns: number;
    accepted: number;
    rejected: number;
    transmitted: number;
    notFiled: number;
    extended: number;
    amended: number;
    openNotices: number;
  };

  let yearRows: YearRow[];
  if (showsNetworkRollup) {
    const { data } = await supabase.rpc("get_ero_tax_year_metrics", { p_workspace_id: workspace.id });
    yearRows = (data ?? []).map((r) => ({
      key: `${r.source_workspace_id}-${r.tax_year}`,
      firmName: r.source_workspace_id === workspace.id ? "Your firm" : r.source_workspace_name,
      taxYear: r.tax_year,
      totalReturns: r.total_returns,
      accepted: r.accepted,
      rejected: r.rejected,
      transmitted: r.transmitted,
      notFiled: r.not_filed,
      extended: r.extended,
      amended: r.amended,
      openNotices: r.open_irs_notices,
    }));
  } else {
    const { data } = await supabase.from("v_tax_season_metrics").select("*").eq("workspace_id", workspace.id).order("tax_year", { ascending: false });
    yearRows = (data ?? [])
      .filter((r): r is typeof r & { tax_year: number } => r.tax_year !== null)
      .map((r) => ({
        key: String(r.tax_year),
        firmName: null,
        taxYear: r.tax_year,
        totalReturns: r.total_returns ?? 0,
        accepted: r.accepted ?? 0,
        rejected: r.rejected ?? 0,
        transmitted: r.transmitted ?? 0,
        notFiled: r.not_filed ?? 0,
        extended: r.extended ?? 0,
        amended: r.amended ?? 0,
        openNotices: r.open_irs_notices ?? 0,
      }));
  }

  return (
    <>
      <PageHeader title="Tax Office" description={description} />
      {tabNav}
      <div className="flex-1 px-8 py-6">
        {yearRows.length === 0 ? (
          <EmptyState message="No tax-year data yet." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
                  {showsNetworkRollup && <th className="px-4 py-2 text-left font-medium">Firm</th>}
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
                {yearRows.map((r) => (
                  <tr key={r.key} className="hover:bg-surfaceMuted">
                    {showsNetworkRollup && <td className="px-4 py-2 text-slate">{r.firmName}</td>}
                    <td className="px-4 py-2 font-medium text-ink">{r.taxYear}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.totalReturns}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.accepted}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.rejected}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.transmitted}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.notFiled}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.extended}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.amended}</td>
                    <td className="px-4 py-2 text-right text-slate">{r.openNotices}</td>
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
