"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { portalSignOutAction } from "@/lib/auth/actions";

function initials(name: string | null) {
  const source = name || "?";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function PortalUserMenu({ displayName, email }: { displayName: string | null; email: string | null }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="User menu" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar>
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate font-medium">{displayName || email}</div>
          {displayName && email && <div className="text-xs font-normal text-muted-foreground truncate">{email}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/portal/profile" className="gap-2">
            <User className="h-4 w-4" /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2 text-destructive focus:text-destructive">
          <form action={portalSignOutAction} className="contents">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
