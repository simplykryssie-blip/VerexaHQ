import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { GlobalClientDraftBanner } from "@/components/GlobalClientDraftBanner";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/onboarding");
  }

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden bg-surfaceMuted">
        <Sidebar workspaceName={workspace.name} />
        <main id="main-content" className="flex flex-1 flex-col overflow-y-auto pt-14 lg:pt-0">
          <GlobalClientDraftBanner />
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
