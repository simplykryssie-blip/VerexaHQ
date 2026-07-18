"use client";
import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
export default function AdminPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: ok } = await supabase.rpc("is_platform_admin");
      setAllowed(ok === true);
      if (ok === true) {
        const { data: rows } = await supabase.rpc(
          "admin_launch_readiness_dashboard",
        );
        setData(Array.isArray(rows) ? rows : []);
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
      <div className="mt-6 space-y-3">
        {data.map((r: any, i) => (
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
                  width: `${r.total_items ? Math.round((r.completed_items / r.total_items) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
