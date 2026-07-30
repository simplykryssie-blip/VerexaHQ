import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { PortalNavList } from "@/components/portal-shell/portal-nav-list";

export function PortalSidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
      <div className="flex items-center h-14 px-4 border-b border-sidebar-border">
        <Link href="/portal" className="flex items-center gap-2 min-w-0">
          <LogoMark size={26} />
          <span className="font-semibold text-sm truncate">Client Portal</span>
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <PortalNavList />
      </div>
    </aside>
  );
}
