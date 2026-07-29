"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ReadinessRow = {
  category: string | null;
  completed_items: number | null;
  total_items: number | null;
};

export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<ReadinessRow[]>([]);
  useEffect(() => {
    (async () => {
      const { data: ok } = await supabase.rpc("is_platform_admin");
      setAllowed(ok === true);
      if (ok === true) {
        const { data: rows } = await supabase.rpc(
          "admin_launch_readiness_dashboard",
        );
        setData(Array.isArray(rows) ? (rows as ReadinessRow[]) : []);
      }
    })();
  }, []);
  if (allowed === null) return <p className="text-muted">Checking access…</p>;
  if (!allowed)
    return (
      <div className="rounded-2xl border border-line bg-white p-10 text-center">
        <Shield className="mx-auto text-muted" />
        <h1 className="mt-3 text-xl font-bold">Protected area</h1>
        <p className="mt-1 text-sm text-muted">
          Platform administrator access is required.
        </p>
      </div>
    );
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Platform readiness</h1>
      <p className="mt-1 text-sm text-muted">
        Internal launch status. This page is hidden from firm users.
      </p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <Link
          href="/admin/system-health"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#108A64]"
        >
          View system health detail <ArrowRight size={14} />
        </Link>
        <Link
          href="/admin/platform"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#108A64]"
        >
          Platform Management (Early Access) <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mt-6 space-y-3">
        {data.map((r, i) => (
          <div
            key={r.category ?? i}
            className="rounded-2xl border border-line bg-white p-4"
          >
            <div className="flex justify-between">
              <span className="font-semibold text-ink">
                {r.category || "Readiness area"}
              </span>
              <span className="text-sm text-muted">
                {r.completed_items ?? 0}/{r.total_items ?? 0}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-paper">
              <div
                className="brand-gradient h-2 rounded-full"
                style={{
                  width: `${r.total_items ? Math.round(((r.completed_items ?? 0) / r.total_items) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
