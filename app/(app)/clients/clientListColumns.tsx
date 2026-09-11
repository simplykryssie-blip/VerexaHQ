import Link from "next/link";
import type { DataTableColumn } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/Avatar";
import { clientStatusTone } from "@/lib/clientStatus";

// Split out of page.tsx: a Next.js App Router page.tsx file may only export
// `default` and a small fixed set of route config fields (dynamic,
// metadata, ...) -- exporting CLIENT_COLUMNS/ClientRow directly from the
// page fails the build ("is not a valid Page export field"). Also lets
// tests exercise the row-render logic (clientDisplayName, tag/status badges)
// against fixture rows directly, without needing to render the whole page.
export function clientDisplayName(c: {
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
}) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export type ClientRow = {
  id: string;
  client_type: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  lifecycle_status: string;
  tags: string[] | null;
  requestedService?: string | null;
  needsReview?: boolean;
};

export const CLIENT_COLUMNS: DataTableColumn<ClientRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (c) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={clientDisplayName(c)} size="sm" />
        <div>
          <div className="flex items-center gap-1.5">
            <Link href={`/clients/${c.id}`} className="font-medium text-accent hover:underline">
              {clientDisplayName(c)}
            </Link>
            {c.needsReview && (
              <Badge tone="warning" className="shrink-0">
                Submitted -- needs review
              </Badge>
            )}
          </div>
          {c.requestedService && <p className="text-xs text-muted">{c.requestedService}</p>}
        </div>
      </div>
    ),
  },
  { key: "type", header: "Type", render: (c) => <span className="capitalize text-slate">{c.client_type}</span> },
  { key: "email", header: "Email", render: (c) => <span className="text-slate">{c.primary_email ?? "--"}</span> },
  { key: "phone", header: "Phone", render: (c) => <span className="text-slate">{c.primary_phone ?? "--"}</span> },
  {
    key: "status",
    header: "Status",
    render: (c) => (
      <Badge tone={clientStatusTone(c.lifecycle_status)} className="capitalize">
        {c.lifecycle_status.replace(/_/g, " ")}
      </Badge>
    ),
  },
  {
    key: "tags",
    header: "Tags",
    render: (c) =>
      c.tags && c.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <span key={t} className="inline-block rounded-full bg-accentSoft px-2 py-0.5 text-xs font-medium text-accent">
              {t}
            </span>
          ))}
        </div>
      ) : (
        <span className="text-muted">--</span>
      ),
  },
];
