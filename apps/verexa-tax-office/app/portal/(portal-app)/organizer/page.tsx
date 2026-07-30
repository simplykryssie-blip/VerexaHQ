import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalOrganizers } from "@/features/portal/queries";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { intakeStatusLabel } from "@/lib/validation/intake";
import { formatDate } from "@/lib/formatters";

export default async function PortalOrganizerListPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const organizers = await getPortalOrganizers(context.client.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizers</h1>
        <p className="text-sm text-muted-foreground mt-1">Complete the questionnaires your tax office has assigned to you.</p>
      </div>

      {organizers.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No organizers yet" description="Your tax office hasn't assigned an organizer to you yet." />
      ) : (
        <div className="space-y-2">
          {organizers.map((o) => {
            const template = o.template as { name?: string; description?: string } | null;
            return (
              <Link key={o.id} href={`/portal/organizer/${o.id}`}>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-medium">{template?.name ?? "Organizer"}</p>
                      {template?.description && <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {o.due_date ? `Due ${formatDate(o.due_date)}` : "No due date"}
                        {o.tax_year ? ` · Tax year ${o.tax_year}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{Math.round(Number(o.progress_percent ?? 0))}% complete</span>
                      <Badge variant="secondary">{intakeStatusLabel(o.status)}</Badge>
                    </div>
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
