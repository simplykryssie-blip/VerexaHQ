import type { SupabaseClient } from "@supabase/supabase-js";

type ClientLike = { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null };

export function clientLabel(c: ClientLike | null) {
  if (!c) return "--";
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export async function buildEntityLabelMap(supabase: SupabaseClient, refs: { entity_type: string; entity_id: string }[]) {
  const clientIds = Array.from(new Set(refs.filter((r) => r.entity_type === "client").map((r) => r.entity_id)));
  const engagementIds = Array.from(new Set(refs.filter((r) => r.entity_type === "engagement").map((r) => r.entity_id)));

  const [{ data: clients }, { data: engagements }] = await Promise.all([
    clientIds.length > 0
      ? supabase.from("clients").select("id, first_name, last_name, business_name, client_type").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; business_name: string | null; client_type: string }[] }),
    engagementIds.length > 0
      ? supabase
          .from("engagements")
          .select("id, engagement_number, clients(first_name, last_name, business_name, client_type)")
          .in("id", engagementIds)
      : Promise.resolve({ data: [] as { id: string; engagement_number: string | null; clients: ClientLike | null }[] }),
  ]);

  const map = new Map<string, { label: string; href: string }>();
  for (const c of clients ?? []) {
    map.set(`client:${c.id}`, { label: clientLabel(c as ClientLike), href: `/clients/${c.id}` });
  }
  for (const e of engagements ?? []) {
    map.set(`engagement:${e.id}`, {
      label: `${e.engagement_number ?? "Engagement"} -- ${clientLabel(e.clients as unknown as ClientLike)}`,
      href: `/engagements/${e.id}`,
    });
  }
  return map;
}
