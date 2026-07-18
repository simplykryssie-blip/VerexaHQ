"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Calculator,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  FileBarChart,
  FileText,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Settings,
  Shield,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/WorkspaceProvider";

const GROUPS = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutGrid }],
  },
  {
    label: "Clients",
    items: [
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/services", label: "Services", icon: BriefcaseBusiness },
      { href: "/pipeline", label: "Workflows", icon: BookOpen },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/deadlines", label: "Deadlines", icon: CalendarDays },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/tax", label: "Tax Prep", icon: FileText },
      { href: "/bookkeeping", label: "Bookkeeping", icon: Calculator },
      { href: "/payroll", label: "Payroll", icon: Wallet },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/documents", label: "Documents", icon: FolderOpen },
      { href: "/forms", label: "Forms & Templates", icon: FileText },
      { href: "/billing", label: "Billing", icon: CircleDollarSign },
      { href: "/reports", label: "Reports", icon: FileBarChart },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const MOBILE = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
];

function Nav({
  close,
  isAdmin,
  onSignOut,
}: {
  close?: () => void;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const { workspaces, activeWorkspaceId, switchWorkspace, activeWorkspace } =
    useWorkspace();
  return (
    <div className="flex h-full flex-col bg-[#132922] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <Logo size={18} />
        <div className="mt-4 relative">
          <select
            aria-label="Active workspace"
            value={activeWorkspaceId ?? ""}
            onChange={(e) => switchWorkspace(e.target.value)}
            className="w-full appearance-none rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 pr-8 text-xs font-semibold text-white outline-none"
          >
            <option value="" disabled>
              Select workspace
            </option>
            {workspaces.map((w) => (
              <option className="text-ink" key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/60"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-white/40">
              {group.label}
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  onClick={close}
                  key={item.href}
                  href={item.href}
                  className={`mb-0.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-white/12 text-white" : "text-white/72 hover:bg-white/7 hover:text-white"}`}
                >
                  <Icon size={17} className={active ? "text-[#36D39A]" : ""} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
        {isAdmin && (
          <Link
            href="/admin"
            onClick={close}
            className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white/70 hover:bg-white/10"
          >
            <Shield size={17} />
            Platform Admin
          </Link>
        )}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 truncate text-xs text-white/60">
          {activeWorkspace?.role ?? "Workspace member"}
        </div>
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured) {
      router.replace("/setup");
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? "");
      const { data: isAdmin } = await supabase.rpc("is_platform_admin");
      setAdmin(isAdmin === true);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);
  useEffect(() => {
    setMenu(false);
    setMore(false);
  }, [pathname]);
  const title = useMemo(
    () =>
      GROUPS.flatMap((g) => g.items).find(
        (i) => pathname === i.href || pathname?.startsWith(`${i.href}/`),
      )?.label ?? (pathname === "/admin" ? "Platform Admin" : "VerexaHQ"),
    [pathname],
  );
  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }
  if (!ready)
    return (
      <div className="min-h-screen grid place-items-center bg-paper text-sm text-muted">
        Loading your workspace…
      </div>
    );
  return (
    <div className="min-h-screen bg-paper lg:flex">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] lg:block">
        <Nav isAdmin={admin} onSignOut={signOut} />
      </aside>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMenu(false)}
          />
          <aside className="relative h-full w-[min(86vw,330px)] shadow-2xl">
            <button
              aria-label="Close menu"
              className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center text-white"
              onClick={() => setMenu(false)}
            >
              <X />
            </button>
            <Nav
              close={() => setMenu(false)}
              isAdmin={admin}
              onSignOut={signOut}
            />
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1 lg:pl-[252px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:px-7">
          <button
            aria-label="Open menu"
            onClick={() => setMenu(true)}
            className="grid h-10 w-10 place-items-center rounded-xl border border-line lg:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="hidden min-w-[140px] text-base font-bold text-ink sm:block">
            {title}
          </div>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <Link
              aria-label="Notifications"
              href="/notifications"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted hover:text-ink"
            >
              <Bell size={18} />
            </Link>
            <div className="hidden max-w-[180px] truncate text-xs text-muted xl:block">
              {email}
            </div>
          </div>
        </header>
        <main className="min-w-0 px-3 py-5 pb-24 sm:px-5 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {MOBILE.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? "text-[#108A64]" : "text-muted"}`}
            >
              <Icon size={19} />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMenu(true)}
          className="flex min-h-[62px] flex-col items-center justify-center gap-1 text-[10px] font-semibold text-muted"
        >
          <PanelLeftClose size={19} />
          More
        </button>
      </nav>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
