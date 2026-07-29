"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    (async () => {
      const { data: ok } = await supabase.rpc("is_platform_admin");
      setAllowed(ok === true);
    })();
  }, []);

  if (allowed === null) {
    return <p className="text-muted">Checking access…</p>;
  }
  if (!allowed) {
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center">
        <Shield className="mx-auto text-muted" />
        <h1 className="mt-3 text-xl font-bold">Protected area</h1>
        <p className="mt-1 text-sm text-muted">
          Platform administrator access is required.
        </p>
      </div>
    );
  }

  return (
    <div>
      {pathname !== "/admin/platform" && (
        <Link
          href="/admin/platform"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft size={14} /> Platform Management
        </Link>
      )}
      {children}
    </div>
  );
}
