import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { clientLabel } from "@/lib/documentEntityLabels";
import { EngagementBoard, type BoardEngagement } from "@/components/engagements/EngagementBoard";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const BOARD_CAP = 500;

export default async function EngagementsPage({ searchParams }: { searchParams: { page?: string; view?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const view = searchParams.view === "board" ? "board" : "table";
  const page = Math.max(Number(searchParams.page) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createClient();

  const [{ data: engagements, count }, { data: canCreate }, { data: boardEngagements }] = await Promise.all([
    view === "table"
      ? supabase
          .from("engagements")
          .select("id, engagement_number, status, priority, due_date, clients(first_name, last_name, business_name, client_type)", {
            count: "exact",
          })
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false })
          .range(from, to)
      : Promise.resolve({ data: null, count: null }),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.manage" }),
    view === "board"
      ? supabase
          .from("engagements")
          .select("id, engagement_number, status, priority, due_date, client_id, clients(first_name, last_name, business_name, client_type)")
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: false })
          .limit(BOARD_CAP)
      : Promise.resolve({ data: null }),
  ]);

  const boardItems: BoardEngagement[] = (boardEngagements ?? []).map((e) => ({
    id: e.id,
    engagement_number: e.engagement_number,
    status: e.status,
    priority: e.priority,
    due_date: e.due_date,
    clientLabel: clientLabel(e.clients as never),
    clientHref: `/clients/${e.client_id}`,
  }));

  const isEmpty = view === "table" ? !engagements || engagements.length === 0 : boardItems.length === 0;

  return (
    <>
      <PageHeader
        title="Engagements"
        description="The actual work you're doing for clients -- one engagement per service per client, each moving through its own pipeline."
        actions={
          canCreate ? (
            <Link
              href="/engagements/new"
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              + New Engagement
            </Link>
          ) : null
        }
      />
      <div className="flex-1 px-8 py-6">
        <nav className="mb-4 flex gap-1 border-b border-border">
          <Link
            href="/engagements?view=table"
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              view === "table" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Table
          </Link>
          <Link
            href="/engagements?view=board"
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              view === "board" ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Board
          </Link>
        </nav>

        {isEmpty ? (
          <div className="rounded-2xl border border-border bg-surface shadow-soft">
            <EmptyState message="No engagements yet." />
          </div>
        ) : view === "board" ? (
          <EngagementBoard engagements={boardItems} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Number</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">IRS due date / deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(engagements ?? []).map((e) => {
                  const c = e.clients as unknown as {
                    first_name: string | null;
                    last_name: string | null;
                    business_name: string | null;
                    client_type: string;
                  } | null;
                  const clientName = c
                    ? c.client_type === "business" && c.business_name
                      ? c.business_name
                      : [c.first_name, c.last_name].filter(Boolean).join(" ")
                    : "--";
                  return (
                    <tr key={e.id} className="hover:bg-surfaceMuted">
                      <td className="px-5 py-3">
                        <Link href={`/engagements/${e.id}`} className="font-medium text-accent hover:underline">
                          {e.engagement_number}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-slate">{clientName}</td>
                      <td className="px-5 py-3 text-slate">{e.status}</td>
                      <td className="px-5 py-3 text-slate">{e.priority}</td>
                      <td className="px-5 py-3 text-slate">
                        {e.due_date ? new Date(e.due_date).toLocaleDateString() : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager page={page} pageSize={PAGE_SIZE} total={count ?? engagements?.length ?? 0} basePath="/engagements" />
          </div>
        )}
      </div>
    </>
  );
}
