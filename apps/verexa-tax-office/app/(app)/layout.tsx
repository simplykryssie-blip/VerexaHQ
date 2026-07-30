import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserMemberships, getSelectedWorkspaceId } from "@/lib/auth/workspace";
import { WorkspaceProvider, type WorkspaceContextValue } from "@/components/providers/workspace-provider";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Header } from "@/components/app-shell/header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const memberships = await getUserMemberships();
  if (memberships.length === 0) redirect("/onboarding");

  const selectedId = await getSelectedWorkspaceId();
  const active = memberships.find((m) => m.workspace.id === selectedId) ?? memberships[0];

  if (active.workspace.status === "suspended") redirect("/workspace-suspended");
  if (active.workspace.status === "archived") redirect("/unauthorized");
  if (active.role === "client") redirect("/unauthorized");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, first_name, last_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const fullName = profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || null;

  const contextValue: WorkspaceContextValue = {
    workspace: active.workspace,
    role: active.role,
    memberships: memberships.map((m) => ({ workspaceId: m.workspace.id, workspaceName: m.workspace.name, role: m.role })),
    user: { id: user.id, email: user.email ?? null, fullName },
  };

  return (
    <WorkspaceProvider value={contextValue}>
      <div className="flex h-screen overflow-hidden bg-secondary/30">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <Header />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
