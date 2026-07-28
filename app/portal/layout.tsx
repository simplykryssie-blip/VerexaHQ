"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { supabasePortal } from "@/lib/supabasePortal";
import { PortalProvider, usePortal } from "@/components/portal/PortalContext";
import { LogoMark } from "@/components/Logo";
import { ToastProvider } from "@/components/Toast";

const PUBLIC_PATHS_PREFIXES = ["/portal/login", "/portal/accept"];

function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const isPublicPath = PUBLIC_PATHS_PREFIXES.some((p) => pathname?.startsWith(p));
  const { access, accessList, selectAccess, loading } = usePortal();

  useEffect(() => {
    supabasePortal.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setCheckedAuth(true);
      if (!data.session && !isPublicPath) {
        router.replace("/portal/login");
      }
    });
    const { data: sub } = supabasePortal.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
      if (!session && !isPublicPath) router.replace("/portal/login");
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleSignOut() {
    await supabasePortal.auth.signOut();
    router.replace("/portal/login");
  }

  if (isPublicPath) {
    return <div className="min-h-screen bg-paper">{children}</div>;
  }

  if (!checkedAuth || (hasSession && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper text-muted text-sm">
        Loading…
      </div>
    );
  }

  if (!hasSession) {
    return null;
  }

  if (!access && accessList.length > 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm bg-white border border-line rounded-sm p-6">
          <h2 className="font-slab text-lg font-bold text-ink mb-4">Choose an account</h2>
          <div className="space-y-2">
            {accessList.map((a) => (
              <button
                key={a.portal_access_id}
                onClick={() => selectAccess(a)}
                className="w-full text-left border border-line rounded-sm px-3 py-2.5 hover:bg-paper transition-colors"
              >
                <div className="text-sm font-semibold text-ink">{a.client_name}</div>
                <div className="text-xs text-muted">{a.workspace_name}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!access && accessList.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm text-muted mb-4">
            This account doesn&apos;t have portal access to any client yet. If your
            accountant sent you an invitation link, use that link to activate access.
          </p>
          <button
            onClick={handleSignOut}
            className="text-xs font-semibold text-ink underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-paper">
      <header className="bg-ink text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <div>
            <div className="font-slab text-lg font-bold">{access?.workspace_name}</div>
            <div className="text-[11px] uppercase tracking-widest text-white/70">
              Client Portal — {access?.client_name}
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-5 text-sm font-medium">
          <Link href="/portal" className="text-white/85 hover:text-white">
            Home
          </Link>
          <Link href="/portal/todos" className="text-white/85 hover:text-white">
            To-Dos
          </Link>
          <Link href="/portal/documents" className="text-white/85 hover:text-white">
            Documents
          </Link>
          <Link href="/portal/messages" className="text-white/85 hover:text-white">
            Messages
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-white/70 hover:text-white"
          >
            <LogOut size={14} /> Sign out
          </button>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <PortalProvider>
        <PortalShell>{children}</PortalShell>
      </PortalProvider>
    </ToastProvider>
  );
}
