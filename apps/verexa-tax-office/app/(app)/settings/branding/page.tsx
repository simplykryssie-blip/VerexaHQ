import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { roleHasCapability } from "@/lib/permissions/capabilities";
import { BrandingForm } from "@/features/settings/branding-form";

export default async function BrandingPage() {
  const active = await getActiveWorkspace();
  if (!active) redirect("/workspaces");
  if (!roleHasCapability(active.role, "manage_workspace")) redirect("/unauthorized");

  const supabase = await createClient();
  const { data: workspace } = await supabase.from("workspaces").select("id, settings").eq("id", active.workspace.id).single();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
        <p className="text-sm text-muted-foreground mt-1">Your logo and brand color appear on client-facing pages.</p>
      </div>
      <BrandingForm workspaceId={workspace!.id} settings={(workspace!.settings as Record<string, unknown>) ?? {}} />
    </div>
  );
}
