import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
// Kept small (well under GHL's own max of 100) so a page of sequential
// create_client round-trips comfortably finishes inside the function's
// time budget -- the client loops over pages, so total throughput is the
// same either way.
const PAGE_LIMIT = 25;
const IMPORT_TAG = "source:ghl-import";
// Automations that could fire once per imported contact -- new-lead
// notifications/portal invites, and any tag-triggered automation whose tag
// happens to collide with a GHL tag name -- are paused for the run rather
// than blasting staff or clients for a batch of historical contacts.
const PAUSE_TRIGGER_TYPES = ["lead.created", "client.tag_added"];

type GhlContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
};

type GhlContactsResponse = {
  contacts?: GhlContact[];
  meta?: { startAfterId?: string; startAfter?: number };
};

type Cursor = { startAfterId?: string; startAfter?: number } | null;

type RequestBody = {
  phase?: "start" | "page" | "finish";
  cursor?: Cursor;
  pausedAutomationIds?: string[];
};

async function ghlFetch(path: string, apiKey: string) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as { message?: string })?.message || `GoHighLevel returned ${res.status}`;
    throw new Error(message);
  }
  return json as GhlContactsResponse;
}

function splitName(contact: GhlContact): { firstName?: string; lastName?: string } {
  if (contact.firstName || contact.lastName) {
    return { firstName: contact.firstName?.trim() || undefined, lastName: contact.lastName?.trim() || undefined };
  }
  const parts = (contact.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const body = (await request.json().catch(() => ({}))) as RequestBody;

  if (body.phase === "start") {
    const { data: toPause } = await supabase
      .from("automations")
      .select("id")
      .eq("workspace_id", workspace.id)
      .in("trigger_type", PAUSE_TRIGGER_TYPES)
      .eq("is_enabled", true);
    const pausedAutomationIds = (toPause ?? []).map((a) => a.id);
    if (pausedAutomationIds.length > 0) {
      await supabase.from("automations").update({ is_enabled: false }).in("id", pausedAutomationIds);
    }
    return NextResponse.json({ ok: true, pausedAutomationIds });
  }

  if (body.phase === "finish") {
    const ids = body.pausedAutomationIds ?? [];
    if (ids.length > 0) {
      await supabase.from("automations").update({ is_enabled: true }).in("id", ids);
    }
    return NextResponse.json({ ok: true });
  }

  // phase === "page" (or omitted/legacy) from here on.
  const { data: connRows, error: connError } = await supabase.rpc("get_workspace_ghl_connection", {
    p_workspace_id: workspace.id,
  });
  const connection = connRows?.[0];
  if (connError || !connection?.api_key || !connection?.location_id) {
    return NextResponse.json({ ok: false, error: "Connect your GoHighLevel account first." }, { status: 400 });
  }

  const params = new URLSearchParams({ locationId: connection.location_id, limit: String(PAGE_LIMIT) });
  if (body.cursor?.startAfterId) params.set("startAfterId", body.cursor.startAfterId);
  if (body.cursor?.startAfter) params.set("startAfter", String(body.cursor.startAfter));

  let page: GhlContactsResponse;
  try {
    page = await ghlFetch(`/contacts/?${params.toString()}`, connection.api_key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach GoHighLevel";
    return NextResponse.json({ ok: false, error: `Could not fetch contacts from GoHighLevel: ${message}` }, { status: 502 });
  }

  const contacts = page.contacts ?? [];
  if (contacts.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, skippedDuplicate: 0, skippedInvalid: 0, hasMore: false, nextCursor: null });
  }

  let imported = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;
  const errors: string[] = [];
  const tagsSeen = new Set<string>();

  for (const contact of contacts) {
    const email = contact.email?.trim() || undefined;
    const phone = contact.phone?.trim() || undefined;
    if (!email && !phone) {
      skippedInvalid++;
      continue;
    }

    const { firstName, lastName } = splitName(contact);
    const isBusiness = !firstName && !lastName && Boolean(contact.companyName);

    const { data: createResult, error: createError } = await supabase.rpc("create_client", {
      p_workspace_id: workspace.id,
      p_client_type: isBusiness ? "business" : "individual",
      p_first_name: isBusiness ? undefined : firstName,
      p_last_name: isBusiness ? undefined : lastName,
      p_business_name: isBusiness ? contact.companyName : undefined,
      p_primary_email: email,
      p_primary_phone: phone,
      p_force_create: false,
    });

    if (createError) {
      errors.push(`${email || phone || contact.id || "unknown contact"}: ${createError.message}`);
      continue;
    }

    const result = createResult as { client_id: string; is_new: boolean } | null;
    if (!result?.is_new) {
      skippedDuplicate++;
      continue;
    }

    const ghlTags = (contact.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const tags = Array.from(new Set([...ghlTags, IMPORT_TAG]));
    for (const t of tags) tagsSeen.add(t);

    const { error: tagError } = await supabase.from("clients").update({ tags }).eq("id", result.client_id);
    if (tagError) {
      errors.push(`${email || phone}: created but couldn't set tags -- ${tagError.message}`);
    }
    imported++;
  }

  // Best-effort -- register any new tag names in the workspace's Tags
  // registry so they show up under Settings > Tags right away instead of
  // staying invisible until someone edits a client. A failure here doesn't
  // roll back the import; the tag just won't be pre-registered.
  for (const tag of tagsSeen) {
    await supabase.rpc("create_workspace_tag", { p_workspace_id: workspace.id, p_name: tag });
  }

  const nextCursor: Cursor = page.meta?.startAfterId ? { startAfterId: page.meta.startAfterId, startAfter: page.meta.startAfter } : null;

  return NextResponse.json({
    ok: true,
    imported,
    skippedDuplicate,
    skippedInvalid,
    errors,
    hasMore: contacts.length === PAGE_LIMIT && Boolean(nextCursor),
    nextCursor,
  });
}
