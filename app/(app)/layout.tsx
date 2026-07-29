"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BriefcaseBusiness,
  Bug,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  FileBarChart,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Rocket,
  Settings,
  Shield,
  User,
  Users,
  X,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ToastProvider } from "@/components/Toast";
import {
  WorkspaceProvider,
  useWorkspace,
} from "@/components/WorkspaceProvider";
import { useEarlyAccessMembership } from "@/lib/earlyAccess/useEarlyAccessMembership";
import { useUnreadAnnouncementCount } from "@/lib/earlyAccess/useUnreadAnnouncementCount";
import ReportBugModal from "@/components/earlyAccess/ReportBugModal";

// Primary navigation, per the approved product spec. Every entry routes to
// a real page — none of these are placeholders.
const PRD_NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutGrid },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/work", label: "Work", icon: BriefcaseBusiness },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/messages", label: "Communication", icon: MessageSquare },
  { href: "/billing", label: "Billing", icon: CircleDollarSign },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/forms", label: "Templates", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE = [
  PRD_NAV[0],
  PRD_NAV[1],
  PRD_NAV[2],
  PRD_NAV[3],
];

type QuickCreateItem = {
  label: string;
  href?: string;
  available: boolean;
  note?: string;
};

const QUICK_CREATE: QuickCreateItem[] = [
  { label: "Client / lead", href: "/clients?new=1", available: true },
  {
    label: "Service workspace",
    href: "/clients",
    available: true,
    note: "Pick a client, then Add Service",
  },
  { label: "Task", href: "/tasks?new=1", available: true },
  { label: "Document request", href: "/documents?new=1", available: true },
  { label: "Invoice", href: "/billing?new=1", available: true },
  {
    label: "Appointment",
    available: false,
    note: "Coming with the Calendar build",
  },
  { label: "Secure message", href: "/messages", available: true },
  {
    label: "Internal note",
    available: false,
    note: "Add notes from a Service Workspace's Notes tab",
  },
];

function QuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick create"
        className="flex h-10 items-center gap-1.5 rounded-xl bg-[#108A64] px-3 text-sm font-semibold text-white hover:bg-[#0d6f51]"
      >
        <Plus size={16} />
        <span className="hidden sm:inline">Create</span>
      </button>
      {open && (
        <>
          <button
            aria-label="Close"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-xl">
            {QUICK_CREATE.map((item) => (
              <button
                key={item.label}
                disabled={!item.available}
                onClick={() => {
                  if (!item.href) return;
                  setOpen(false);
                  router.push(item.href);
                }}
                className={`flex w-full flex-col items-start px-3.5 py-2.5 text-left text-sm ${
                  item.available
                    ? "text-ink hover:bg-paper"
                    : "cursor-not-allowed text-muted/60"
                }`}
              >
                <span className="font-semibold">{item.label}</span>
                {item.note && (
                  <span className="mt-0.5 text-[11px] text-muted">
                    {item.note}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function UserMenu({
  email,
  role,
  onSignOut,
}: {
  email: string;
  role: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted hover:text-ink"
      >
        <User size={17} />
      </button>
      {open && (
        <>
          <button
            aria-label="Close"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-xl">
            <div className="border-b border-line px-3.5 py-2.5">
              <div className="truncate text-sm font-semibold text-ink">
                {email || "Signed in"}
              </div>
              {role && (
                <div className="mt-0.5 text-xs capitalize text-muted">
                  {role}
                </div>
              )}
            </div>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-ink hover:bg-paper"
            >
              <Settings size={15} /> Settings
            </Link>
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3.5 py-2.5 text-sm text-ink hover:bg-paper"
            >
              <HelpCircle size={15} /> Help
            </Link>
            <button
              onClick={onSignOut}
              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm text-ink hover:bg-paper"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

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
  const { inProgram: inEarlyAccess, campaign: earlyAccessCampaign } = useEarlyAccessMembership(activeWorkspaceId);
  const unreadAnnouncements = useUnreadAnnouncementCount(activeWorkspaceId, earlyAccessCampaign?.id ?? null);
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
        {PRD_NAV.map((item) => {
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
        {inEarlyAccess && (
          <Link
            href="/early-access"
            onClick={close}
            className={`mt-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              pathname === "/early-access" || pathname?.startsWith("/early-access/")
                ? "bg-white/12 text-white"
                : "text-white/72 hover:bg-white/7 hover:text-white"
            }`}
          >
            <Rocket size={17} className={pathname?.startsWith("/early-access") ? "text-[#36D39A]" : ""} />
            Early Access
            {unreadAnnouncements > 0 && (
              <span className="ml-auto grid h-4.5 min-w-4.5 place-items-center rounded-full bg-[#36D39A] px-1 text-[10px] font-bold text-[#0D1B14]">
                {unreadAnnouncements > 9 ? "9+" : unreadAnnouncements}
              </span>
            )}
          </Link>
        )}
        {isAdmin && (
          <Link
            href="/admin"
            onClick={close}
            className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 text-sm text-white/70 hover:bg-white/10"
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
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { inProgram: inEarlyAccess, campaign: earlyAccessCampaign } =
    useEarlyAccessMembership(activeWorkspaceId);
  const [ready, setReady] = useState(false);
  const [menu, setMenu] = useState(false);
  const [email, setEmail] = useState("");
  const [admin, setAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showReportBug, setShowReportBug] = useState(false);

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
  }, [pathname]);

  const loadUnread = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const { count } = await supabase
      .from("v_my_notifications")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", activeWorkspaceId)
      .is("read_at", null);
    setUnreadCount(count ?? 0);
  }, [activeWorkspaceId]);

  useEffect(() => {
    void loadUnread();
  }, [loadUnread, pathname]);

  const activeItem = useMemo(
    () =>
      PRD_NAV.find(
        (i) => pathname === i.href || pathname?.startsWith(`${i.href}/`),
      ),
    [pathname],
  );
  const title = activeItem?.label ?? (pathname === "/admin" ? "Platform Admin" : "VerexaHQ");

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
          <div className="hidden min-w-[100px] text-base font-bold text-ink sm:block">
            {title}
          </div>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            {inEarlyAccess && (
              <button
                onClick={() => setShowReportBug(true)}
                className="hidden items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-semibold text-muted hover:text-ink sm:flex"
              >
                <Bug size={15} /> Report a bug
              </button>
            )}
            <QuickCreateMenu />
            <Link
              aria-label="Notifications"
              href="/notifications"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted hover:text-ink"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-[#B3261E] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link
              aria-label="Help"
              href="/help"
              className="hidden h-10 w-10 place-items-center rounded-xl border border-line bg-white text-muted hover:text-ink sm:grid"
            >
              <HelpCircle size={18} />
            </Link>
            <UserMenu
              email={email}
              role={activeWorkspace?.role ?? ""}
              onSignOut={signOut}
            />
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
      {showReportBug && activeWorkspaceId && (
        <ReportBugModal
          workspaceId={activeWorkspaceId}
          campaignId={earlyAccessCampaign?.id ?? null}
          appVersion={earlyAccessCampaign?.version_label ?? null}
          onClose={() => setShowReportBug(false)}
        />
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <Shell>{children}</Shell>
      </WorkspaceProvider>
    </ToastProvider>
  );
}
