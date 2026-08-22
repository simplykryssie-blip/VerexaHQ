import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";

/**
 * The persistent chrome the sidebar alone couldn't provide: where you are (breadcrumbs),
 * a fast way to jump to a client (search), and notifications anchored somewhere predictable
 * instead of floating over whatever the page happens to render underneath.
 */
export function AppHeader({ workspaceId, userId }: { workspaceId: string; userId: string | null }) {
  return (
    <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2.5 lg:px-8">
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <GlobalSearch workspaceId={workspaceId} />
      {userId && <NotificationBell workspaceId={workspaceId} userId={userId} />}
    </header>
  );
}
