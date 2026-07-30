import Link from "next/link";
import { redirect } from "next/navigation";
import { FileCheck2 } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalCompletedReturns } from "@/features/portal/queries";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/formatters";

export default async function PortalCompletedReturnsPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const releases = await getPortalCompletedReturns(context.client.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Completed Returns</h1>
        <p className="text-sm text-muted-foreground mt-1">Returns your tax office has finished and released to you.</p>
      </div>

      {releases.length === 0 ? (
        <EmptyState icon={FileCheck2} title="Nothing released yet" description="Completed returns appear here once your tax office releases them." />
      ) : (
        <div className="space-y-2">
          {releases.map((r) => (
            <Link key={r.id} href={`/portal/returns/${r.engagement_id}`}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <p className="font-medium">{r.engagement?.title || r.engagement?.engagement_number || "Tax return"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.engagement?.tax_year ? `Tax year ${r.engagement.tax_year} · ` : ""}
                    Released {formatDate(r.released_at)}
                  </p>
                  {r.release_notes && <p className="text-sm mt-1.5">{r.release_notes}</p>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
