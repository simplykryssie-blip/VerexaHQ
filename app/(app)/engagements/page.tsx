import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function EngagementsPage({ searchParams }: { searchParams: { page?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const page = Math.max(Number(searchParams.page) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createClient();
  const [{ data: engagements, count }, { data: canCreate }] = await Promise.all([
    supabase
      .from("engagements")
      .select("id, engagement_number, status, priority, due_date, clients(first_name, last_name, business_name, client_type)", {
        count: "exact",
      })
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "engagements.manage" }),
  ]);

  return (
    <>
      <PageHeader
        title="Engagements"
        description="Every engagement in your workspace."
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
        {!engagements || engagements.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState message="No engagements yet." />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Number</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Priority</th>
                  <th className="px-5 py-3 font-medium">Due date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {engagements.map((e) => {
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
            <Pager page={page} pageSize={PAGE_SIZE} total={count ?? engagements.length} basePath="/engagements" />
          </div>
        )}
      </div>
    </>
  );
}
