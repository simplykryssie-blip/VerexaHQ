import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getDocumentRequests } from "@/features/document-requests/queries";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requestStatusLabel } from "@/lib/validation/document-requests";
import { formatDate } from "@/lib/formatters";

export default async function PortalDocumentRequestsPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const requests = await getDocumentRequests(context.client.workspace_id, { clientId: context.client.id });
  const visible = requests.filter((r) => r.status !== "draft" && r.status !== "cancelled");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Document Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">Documents your tax office still needs from you.</p>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={FileText} title="No open requests" description="You're all caught up — nothing outstanding right now." />
      ) : (
        <div className="space-y-2">
          {visible.map((r) => {
            const items = (r.items as { id: string; status: string }[] | null) ?? [];
            const complete = items.filter((i) => ["accepted", "waived", "not_applicable"].includes(i.status)).length;
            return (
              <Link key={r.id} href={`/portal/document-requests/${r.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.due_date ? `Due ${formatDate(r.due_date)}` : "No due date"} · {complete} of {items.length} items complete
                      </p>
                    </div>
                    <Badge variant="secondary">{requestStatusLabel(r.status)}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
