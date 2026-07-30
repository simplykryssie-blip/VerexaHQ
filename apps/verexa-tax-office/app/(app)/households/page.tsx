import Link from "next/link";
import { Home } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { HouseholdFormDialog } from "@/features/households/household-form-dialog";
import { Card, CardContent } from "@/components/ui/card";

export default async function HouseholdsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user!.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const workspaceId = membership!.workspace_id;

  const { data: households } = await supabase
    .from("tax_households")
    .select("*, members:household_members(id)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Households</h1>
          <p className="text-sm text-muted-foreground mt-1">Group related taxpayers, spouses, and dependents.</p>
        </div>
        <HouseholdFormDialog workspaceId={workspaceId} />
      </div>

      {!households || households.length === 0 ? (
        <EmptyState icon={Home} title="No households yet" description="Create a household to link a taxpayer, spouse, and dependents." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {households.map((h) => (
            <Link key={h.id} href={`/households/${h.id}`}>
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="font-medium">{h.household_name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {(h.members as unknown[])?.length ?? 0} member(s)
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
