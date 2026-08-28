import Link from "next/link";
import { DataTableColumn } from "@/components/ui/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

export function statusTone(status: string): BadgeTone {
  if (status === "lost") return "danger";
  if (status === "active") return "success";
  if (status === "archived") return "neutral";
  return "warning";
}

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
  stageLabel?: string | null;
};

export const CLIENT_COLUMNS: DataTableColumn<ClientRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (c) => (
      <div>
        <Link href={`/clients/${c.id}`} className="font-medium text-accent hover:underline">
          {clientDisplayName(c)}
        </Link>
        {c.requestedService && <p className="text-xs text-muted">{c.requestedService}</p>}
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
      <Badge tone={statusTone(c.lifecycle_status)} className="capitalize">
        {c.stageLabel ?? c.lifecycle_status.replace(/_/g, " ")}
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
