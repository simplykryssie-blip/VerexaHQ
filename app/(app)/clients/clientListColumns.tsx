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
  // Every non-individual client_type (business/trust/estate/organization)
  // shares the same business_name column as its entity name -- there's no
  // per-type name field in the schema.
  if (c.client_type !== "individual" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

/** Pure so the "assigned but profile row missing" fallback is directly
 * testable. A missing user_profiles row (rather than a null
 * relationship_manager_id) still renders as assigned, just with a generic
 * label, instead of silently collapsing to "Unassigned". */
export function resolveAssignedStaff(
  managerId: string | null,
  managerById: Map<string, { id: string; display_name: string | null }>
): { id: string; display_name: string | null } | null {
  if (!managerId) return null;
  return managerById.get(managerId) ?? { id: managerId, display_name: null };
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
  /** clients.relationship_manager_id -- the canonical "assigned staff"
   * relationship (same field search_clients' existing p_assigned_staff_id
   * filter already matches against; this column only adds display, no new
   * assignment mechanism). Undefined/null staff renders as "Unassigned",
   * matching ClientAssignmentForm's own existing empty state. */
  assignedStaff?: { id: string; display_name: string | null } | null;
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
    key: "assignedStaff",
    header: "Assigned Staff",
    render: (c) =>
      c.assignedStaff ? (
        <div className="flex items-center gap-2">
          <Avatar name={c.assignedStaff.display_name} size="xs" />
          <span className="text-slate">{c.assignedStaff.display_name ?? "Staff"}</span>
        </div>
      ) : (
        <span className="text-muted">Unassigned</span>
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
