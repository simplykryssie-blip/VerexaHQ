import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Pager } from "@/components/Pager";
import { NewClientButton } from "./NewClientButton";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function clientDisplayName(c: {
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
}) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function ClientsPage({ searchParams }: { searchParams: { page?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const page = Math.max(Number(searchParams.page) || 1, 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createClient();
  const [{ data: clients, count }, { data: engagementTypes }, { data: canCreate }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, client_type, first_name, last_name, business_name, primary_email, primary_phone, lifecycle_status", { count: "exact" })
      .eq("workspace_id", workspace.id)
      .is("merged_into_client_id", null)
      .order("created_at", { ascending: false })
      .range(from, to),
    supabase
      .from("engagement_types")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("display_order"),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "clients.create" }),
  ]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Every client in your workspace."
        actions={canCreate ? <NewClientButton workspaceId={workspace.id} engagementTypes={engagementTypes ?? []} /> : null}
      />
      <div className="flex-1 px-8 py-6">
        {!clients || clients.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              message="No clients yet. Add your first client to get started."
              action={canCreate ? <NewClientButton workspaceId={workspace.id} engagementTypes={engagementTypes ?? []} /> : undefined}
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-surfaceMuted">
                    <td className="px-5 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium text-accent hover:underline">
                        {clientDisplayName(c)}
                      </Link>
                    </td>
                    <td className="px-5 py-3 capitalize text-slate">{c.client_type}</td>
                    <td className="px-5 py-3 text-slate">{c.primary_email ?? "--"}</td>
                    <td className="px-5 py-3 text-slate">{c.primary_phone ?? "--"}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full bg-accentSoft px-2 py-0.5 text-xs font-medium capitalize text-accent">
                        {c.lifecycle_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} pageSize={PAGE_SIZE} total={count ?? clients.length} basePath="/clients" />
          </div>
        )}
      </div>
    </>
  );
}
