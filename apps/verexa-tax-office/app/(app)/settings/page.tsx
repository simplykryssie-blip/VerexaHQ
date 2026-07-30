import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { roleHasCapability } from "@/lib/permissions/capabilities";
import { OfficeSettingsForm } from "@/features/settings/office-settings-form";

export default async function SettingsPage() {
  const active = await getActiveWorkspace();
  if (!active) redirect("/workspaces");
  if (!roleHasCapability(active.role, "manage_workspace")) redirect("/unauthorized");

  const supabase = await createClient();
  const { data: workspace } = await supabase.from("workspaces").select("*").eq("id", active.workspace.id).single();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Office Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Update your office&apos;s basic information.</p>
      </div>
      <OfficeSettingsForm workspace={workspace!} />
      <p className="text-xs text-muted-foreground">
        Workspace ID (share this with another office to set up a workspace relationship): <code className="rounded bg-secondary px-1.5 py-0.5">{workspace!.id}</code>
      </p>
    </div>
  );
}
