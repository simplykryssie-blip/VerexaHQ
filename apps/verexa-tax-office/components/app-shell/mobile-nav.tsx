"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LogoMark } from "@/components/logo";
import { NavList } from "@/components/app-shell/nav-list";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <div className="flex items-center gap-2 h-14 px-4 border-b border-sidebar-border">
          <LogoMark size={26} />
          <span className="font-semibold text-sm">Verexa Tax Office</span>
        </div>
        <div className="py-4 overflow-y-auto h-[calc(100%-3.5rem)]">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
