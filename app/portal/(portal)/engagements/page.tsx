import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortalIdentity } from "@/lib/portal";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function PortalEngagementsPage() {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id, engagement_number, status, due_date, open_date, engagement_types(name), engagement_tax_details(tax_year, return_type, efile_status)")
    .eq("client_id", identity.clientId)
    .order("open_date", { ascending: false });

  return (
    <>
      <PageHeader title="My Engagements" description="Every service we're working on for you." />
      <div className="flex-1 px-8 py-6">
        {(engagements ?? []).length === 0 ? (
          <EmptyState message="No engagements yet." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {(engagements ?? []).map((e) => {
              const taxDetail = (e.engagement_tax_details as unknown as { tax_year: number | null; return_type: string | null; efile_status: string } | null);
              return (
                <li key={e.id}>
                  <Link href={`/portal/engagements/${e.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surfaceMuted">
                    <div>
                      <p className="font-medium text-slate">{(e.engagement_types as unknown as { name?: string } | null)?.name ?? "Engagement"}</p>
                      <p className="text-xs text-muted">
                        {e.engagement_number}
                        {taxDetail?.tax_year && ` -- Tax year ${taxDetail.tax_year}`}
                        {taxDetail?.efile_status && taxDetail.efile_status !== "not_filed" && ` -- E-file: ${taxDetail.efile_status.replace("_", " ")}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs capitalize text-muted">{e.status}</span>
                      {e.due_date && <p className="text-xs text-muted">Due {new Date(e.due_date).toLocaleDateString()}</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
