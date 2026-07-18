"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";
import NewServiceModal from "@/components/NewServiceModal";
import type { Service } from "@/lib/types";
type Row = Service & {
  clients: {
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
  } | null;
  pipeline_stages: { stage_name: string | null } | null;
};
export default function ServicesPage() {
  const { activeWorkspaceId } = useWorkspace();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    const { data } = await supabase
      .from("services")
      .select(
        "*,clients(first_name,last_name,business_name),pipeline_stages(stage_name)",
      )
      .eq("workspace_id", activeWorkspaceId)
      .order("created_at", { ascending: false });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [activeWorkspaceId]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        `${r.service_type} ${r.service_status} ${r.clients?.business_name ?? ""} ${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [rows, q],
  );
  return (
    <div>
      <Header
        title="Services"
        sub="Manage every client engagement from start to completion."
        action={
          <button
            onClick={() => setOpen(true)}
            className="brand-gradient flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus size={17} />
            New service
          </button>
        }
      />
      <div className="mb-4 max-w-md relative">
        <Search size={16} className="absolute left-3 top-3 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-line bg-white py-2.5 pl-9 pr-3 text-sm"
          placeholder="Search services…"
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-4">Client</th>
              <th>Service</th>
              <th>Status</th>
              <th>Stage</th>
              <th>Due</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  Loading services…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">
                  No services found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="p-4 font-semibold text-ink">
                    <Link
                      href={`/clients/${r.client_id}`}
                      className="hover:text-[#108A64]"
                    >
                      {r.clients?.business_name ||
                        `${r.clients?.first_name ?? ""} ${r.clients?.last_name ?? ""}`.trim() ||
                        "Client"}
                    </Link>
                  </td>
                  <td>{r.service_type?.replaceAll("_", " ")}</td>
                  <td>
                    <span className="rounded-full bg-paper px-2.5 py-1 text-xs">
                      {r.service_status}
                    </span>
                  </td>
                  <td>{r.pipeline_stages?.stage_name || "—"}</td>
                  <td>
                    {r.due_date
                      ? new Date(r.due_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    {r.price != null
                      ? Number(r.price).toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <NewServiceModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
function Header({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}
