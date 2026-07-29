"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileText, Search, Users, Wrench, CheckSquare, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useWorkspace } from "@/components/WorkspaceProvider";

type Result = {
  id: string;
  label: string;
  sub: string;
  href: string;
  kind: "client" | "service" | "task" | "document";
};
const icons = {
  client: Users,
  service: Wrench,
  task: CheckSquare,
  document: FileText,
};

export function GlobalSearch() {
  const { activeWorkspaceId } = useWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2 || !activeWorkspaceId) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      const needle = `%${query.trim()}%`;
      const [clients, services, tasks, documents] = await Promise.all([
        supabase
          .from("clients")
          .select("id, first_name, last_name, business_name, email")
          .eq("workspace_id", activeWorkspaceId)
          .or(
            `first_name.ilike.${needle},last_name.ilike.${needle},business_name.ilike.${needle},email.ilike.${needle}`,
          )
          .limit(5),
        supabase
          .from("services")
          .select("id, client_id, service_type, service_status")
          .eq("workspace_id", activeWorkspaceId)
          .ilike("service_type", needle)
          .limit(4),
        supabase
          .from("tasks")
          .select("id, client_id, task_title, task_status")
          .eq("workspace_id", activeWorkspaceId)
          .ilike("task_title", needle)
          .limit(4),
        supabase
          .from("documents")
          .select("id, client_id, document_name, document_status")
          .eq("workspace_id", activeWorkspaceId)
          .ilike("document_name", needle)
          .limit(4),
      ]);
      const rows: Result[] = [];
      (clients.data ?? []).forEach((r: any) =>
        rows.push({
          id: r.id,
          label:
            r.business_name ||
            `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() ||
            "Client",
          sub: r.email || "Client",
          href: `/clients/${r.id}`,
          kind: "client",
        }),
      );
      (services.data ?? []).forEach((r: any) =>
        rows.push({
          id: r.id,
          label: r.service_type || "Service",
          sub: r.service_status || "Service",
          href: "/services",
          kind: "service",
        }),
      );
      (tasks.data ?? []).forEach((r: any) =>
        rows.push({
          id: r.id,
          label: r.task_title || "Task",
          sub: r.task_status || "Task",
          href: "/tasks",
          kind: "task",
        }),
      );
      (documents.data ?? []).forEach((r: any) =>
        rows.push({
          id: r.id,
          label: r.document_name || "Document",
          sub: r.document_status || "Document",
          href: "/documents",
          kind: "document",
        }),
      );
      setResults(rows);
      setBusy(false);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, activeWorkspaceId]);
  return (
    <div className="relative w-full min-w-0 max-w-xl">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        size={17}
      />
      <input
        aria-label="Search clients, work, tasks, documents"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full min-w-0 truncate rounded-xl border border-line bg-paper py-2.5 pl-9 pr-9 text-sm outline-none focus:border-teal focus:bg-white"
        placeholder="Search…"
      />
      {query && (
        <button
          aria-label="Clear search"
          onClick={() => setQuery("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted"
        >
          <X size={16} />
        </button>
      )}
      {(results.length > 0 || busy) && query.length >= 2 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          {busy ? (
            <div className="p-4 text-sm text-muted">Searching…</div>
          ) : (
            results.map((row) => {
              const Icon = icons[row.kind];
              return (
                <Link
                  key={`${row.kind}-${row.id}`}
                  href={row.href}
                  onClick={() => setQuery("")}
                  className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-paper"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-paper text-[#108A64]">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {row.label}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {row.sub}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
