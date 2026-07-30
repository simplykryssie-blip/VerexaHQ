import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { NewRelationshipDialog, RelationshipStatusActions } from "@/features/relationships/relationship-actions";
import { relationshipTypeLabel, relationshipStatusLabel } from "@/lib/validation/relationships";
import { formatDate } from "@/lib/formatters";

export default async function RelationshipsPage() {
  const active = await getActiveWorkspace();
  if (!active) redirect("/workspaces");
  if (active.role !== "owner" && active.role !== "admin") redirect("/unauthorized");

  const supabase = await createClient();
  const { data: relationships } = await supabase
    .from("workspace_relationships")
    .select("*")
    .or(`source_workspace_id.eq.${active.workspace.id},target_workspace_id.eq.${active.workspace.id}`)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspace Relationships</h1>
          <p className="text-sm text-muted-foreground mt-1">Connections with service bureaus, EROs, and independent preparers.</p>
        </div>
        <NewRelationshipDialog workspaceId={active.workspace.id} />
      </div>

      {!relationships || relationships.length === 0 ? (
        <EmptyState icon={Building2} title="No relationships yet" description="Connect with another office to share templates or collaborate on engagements." />
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {relationships.map((r) => {
            const isSource = r.source_workspace_id === active.workspace.id;
            return (
              <div key={r.id} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{relationshipTypeLabel(r.relationship_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {isSource ? "You initiated this" : "They initiated this"} · {formatDate(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "active" ? "success" : r.status === "declined" || r.status === "ended" ? "destructive" : "secondary"}>
                    {relationshipStatusLabel(r.status)}
                  </Badge>
                  <RelationshipStatusActions relationshipId={r.id} status={r.status} canManage={isSource} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
