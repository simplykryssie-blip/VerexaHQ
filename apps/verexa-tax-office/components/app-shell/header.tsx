"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Search, Bell, HelpCircle, MessagesSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { WorkspaceSwitcher } from "@/components/app-shell/workspace-switcher";
import { UserMenu } from "@/components/app-shell/user-menu";

export function Header({ unreadNotifications = 0, unreadMessages = 0 }: { unreadNotifications?: number; unreadMessages?: number }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="h-14 border-b border-border bg-background flex items-center gap-3 px-3 sm:px-4 shrink-0">
      <MobileNav />
      <div className="hidden lg:block">
        <WorkspaceSwitcher />
      </div>
      <form onSubmit={onSearchSubmit} className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, engagements, documents…"
            className="pl-8"
            aria-label="Global search"
          />
        </div>
      </form>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" asChild aria-label="Messages" className="relative">
          <Link href="/messages">
            <MessagesSquare className="h-5 w-5" />
            {unreadMessages > 0 && (
              <Badge variant="destructive" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] leading-4">
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </Badge>
            )}
          </Link>
        </Button>
        <Button variant="ghost" size="icon" asChild aria-label="Notifications" className="relative">
          <Link href="/notifications">
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <Badge variant="destructive" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] leading-4">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </Badge>
            )}
          </Link>
        </Button>
        <Button variant="ghost" size="icon" asChild aria-label="Help">
          <Link href="/help">
            <HelpCircle className="h-5 w-5" />
          </Link>
        </Button>
        <UserMenu />
      </div>
    </header>
  );
}
