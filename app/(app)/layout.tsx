import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/onboarding");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surfaceMuted">
      <Sidebar workspaceName={workspace.name} />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
