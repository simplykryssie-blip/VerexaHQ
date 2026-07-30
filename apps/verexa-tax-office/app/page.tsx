import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserMemberships, getSelectedWorkspaceId } from "@/lib/auth/workspace";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const memberships = await getUserMemberships();

  if (memberships.length === 0) redirect("/onboarding");

  const activeWorkspace = memberships[0].workspace;
  if (activeWorkspace.status === "suspended") redirect("/workspace-suspended");
  if (activeWorkspace.status === "archived") redirect("/unauthorized");

  if (memberships.length > 1) {
    const selectedId = await getSelectedWorkspaceId();
    const stillValid = selectedId && memberships.some((m) => m.workspace.id === selectedId);
    if (!stillValid) redirect("/workspaces");
  }

  redirect("/dashboard");
}
