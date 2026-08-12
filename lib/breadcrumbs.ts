import { NAV_ITEMS, SETTINGS_NAV_ITEMS } from "@/lib/nav";

function lastSegment(href: string): string {
  return href.split("/").filter(Boolean).pop() ?? href;
}

/** A route word that isn't in NAV_ITEMS/SETTINGS_NAV_ITEMS but still needs a human label. */
const EXTRA_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  new: "New",
  "platform-admin": "Platform Admin",
  plans: "Plans",
  "brand-center": "Brand Center",
  "review-queue": "Review Queue",
};

function buildStaticLabelMap(): Record<string, string> {
  const map: Record<string, string> = { ...EXTRA_LABELS };
  for (const item of NAV_ITEMS) {
    if ("children" in item) {
      for (const child of item.children) map[lastSegment(child.href)] = child.label;
    } else {
      map[lastSegment(item.href)] = item.label;
    }
  }
  for (const item of SETTINGS_NAV_ITEMS) {
    map[lastSegment(item.href)] = item.label;
  }
  return map;
}

/** Derived from the same nav config the sidebar renders -- one source of truth, no separate copy to drift. */
export const STATIC_ROUTE_LABELS = buildStaticLabelMap();

export type EntityResolver = {
  table: string;
  select: string;
  label: (row: Record<string, unknown>) => string;
};

function personOrBusinessName(row: Record<string, unknown>): string {
  const business = row.business_name as string | null | undefined;
  if (business) return business;
  const first = (row.first_name as string | null | undefined) ?? "";
  const last = (row.last_name as string | null | undefined) ?? "";
  return [first, last].filter(Boolean).join(" ");
}

/** Route segment (the one right before a dynamic [id]) -> how to resolve that id to a display name. */
export const ENTITY_RESOLVERS: Record<string, EntityResolver> = {
  clients: {
    table: "clients",
    select: "id, first_name, last_name, business_name",
    label: (row) => personOrBusinessName(row) || "Client",
  },
  engagements: {
    table: "engagements",
    select: "id, clients(first_name,last_name,business_name), services(name)",
    label: (row) => {
      const client = row.clients as Record<string, unknown> | null;
      const service = row.services as { name?: string } | null;
      const clientName = client ? personOrBusinessName(client) : "";
      return [clientName, service?.name].filter(Boolean).join(" — ") || "Engagement";
    },
  },
  "service-packages": {
    table: "services",
    select: "id, name",
    label: (row) => (row.name as string | undefined) || "Service Package",
  },
  workflows: {
    table: "automations",
    select: "id, name",
    label: (row) => (row.name as string | undefined) || "Workflow",
  },
};

export const ID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
