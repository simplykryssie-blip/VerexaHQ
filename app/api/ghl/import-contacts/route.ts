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
// same either way. Dropped further when any of the per-contact extras
// (notes/tasks/appointments/conversations/forms) are requested, since each
// of those adds its own GHL round trip per contact.
const PAGE_LIMIT_CONTACTS_ONLY = 25;
const PAGE_LIMIT_WITH_EXTRAS = 8;
const IMPORT_TAG = "source:ghl-import";
// Automations that could fire once per imported contact -- new-lead
// notifications/portal invites, and any tag-triggered automation whose tag
// happens to collide with a GHL tag name -- are paused for the run rather
// than blasting staff or clients for a batch of historical contacts.
const PAUSE_TRIGGER_TYPES = ["lead.created", "client.tag_added"];

type GhlCustomFieldValue = { id?: string; value?: unknown };

type GhlContact = {
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
  customFields?: GhlCustomFieldValue[];
};

type GhlContactsResponse = {
  contacts?: GhlContact[];
  meta?: { startAfterId?: string; startAfter?: number };
};

type GhlCustomFieldDef = { id: string; name?: string; key?: string; fieldKey?: string };
type GhlCustomFieldsResponse = { customFields?: GhlCustomFieldDef[] };

type GhlNote = { id?: string; body?: string; dateAdded?: string };
type GhlNotesResponse = { notes?: GhlNote[] };

type GhlTask = { id?: string; title?: string; body?: string; dueDate?: string; completed?: boolean };
type GhlTasksResponse = { tasks?: GhlTask[] };

type GhlAppointment = {
  id?: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  appointmentStatus?: string;
  address?: string;
};
type GhlAppointmentsResponse = { events?: GhlAppointment[]; appointments?: GhlAppointment[] };

type GhlConversation = { id?: string; type?: string };
type GhlConversationsSearchResponse = { conversations?: GhlConversation[] };
type GhlMessage = { id?: string; body?: string; direction?: string; dateAdded?: string; type?: string };
type GhlMessagesResponse = { messages?: { messages?: GhlMessage[] } | GhlMessage[] };

type Cursor = { startAfterId?: string; startAfter?: number } | null;

type RequestBody = {
  phase?: "start" | "page" | "finish";
  cursor?: Cursor;
  pausedAutomationIds?: string[];
  filterTags?: string[];
  importCustomFields?: boolean;
  importNotes?: boolean;
  importTasks?: boolean;
  importAppointments?: boolean;
  importConversations?: boolean;
  customFieldDefs?: Record<string, string>;
};

async function ghlFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, Accept: "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as { message?: string })?.message || `GoHighLevel returned ${res.status}`;
    throw new Error(message);
  }
  return json as T;
}

function splitName(contact: GhlContact): { firstName?: string; lastName?: string } {
  if (contact.firstName || contact.lastName) {
    return { firstName: contact.firstName?.trim() || undefined, lastName: contact.lastName?.trim() || undefined };
  }
  const parts = (contact.name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

// Best-effort: each of these imports one GHL sub-resource type for one
// contact. Failures are swallowed into the counters/errors passed back to
// the caller rather than aborting the whole contact -- a 403 on one scope
// (e.g. the token was never granted Notes access) shouldn't take down
// contacts/tags import for everyone else in the batch.

async function importNotesForContact(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  clientId: string,
  ghlContactId: string,
  apiKey: string
): Promise<number> {
  const data = await ghlFetch<GhlNotesResponse>(`/contacts/${ghlContactId}/notes`, apiKey);
  let count = 0;
  for (const note of data.notes ?? []) {
    const body = note.body?.trim();
    if (!body) continue;
    const row = {
      workspace_id: workspaceId,
      entity_type: "client",
      entity_id: clientId,
      body,
      is_internal: true,
      is_private: false,
      is_pinned: false,
      ...(note.dateAdded ? { created_at: note.dateAdded } : {}),
      ...(note.id ? { external_source: "ghl", external_id: note.id } : {}),
    };
    // A GHL id lets a re-run skip a note it already imported; without one
    // (shouldn't happen in practice) there's nothing to dedupe on, so it
    // falls back to a plain insert.
    if (note.id) {
      const { data: inserted, error } = await supabase
        .from("notes")
        .upsert(row, { onConflict: "workspace_id,external_source,external_id", ignoreDuplicates: true })
        .select("id");
      if (!error && inserted && inserted.length > 0) count++;
    } else {
      const { error } = await supabase.from("notes").insert(row);
      if (!error) count++;
    }
  }
  return count;
}

async function importTasksForContact(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  clientId: string,
  ghlContactId: string,
  apiKey: string
): Promise<number> {
  const data = await ghlFetch<GhlTasksResponse>(`/contacts/${ghlContactId}/tasks`, apiKey);
  let count = 0;
  for (const task of data.tasks ?? []) {
    const title = task.title?.trim() || task.body?.trim();
    if (!title) continue;
    const row = {
      workspace_id: workspaceId,
      client_id: clientId,
      title,
      description: task.body?.trim() || null,
      due_date: task.dueDate ?? null,
      status: task.completed ? "completed" : "pending",
      ...(task.id ? { external_source: "ghl", external_id: task.id } : {}),
    };
    if (task.id) {
      const { data: inserted, error } = await supabase
        .from("tasks")
        .upsert(row, { onConflict: "workspace_id,external_source,external_id", ignoreDuplicates: true })
        .select("id");
      if (!error && inserted && inserted.length > 0) count++;
    } else {
      const { error } = await supabase.from("tasks").insert(row);
      if (!error) count++;
    }
  }
  return count;
}

async function importAppointmentsForContact(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  clientId: string,
  ghlContactId: string,
  apiKey: string
): Promise<number> {
  const data = await ghlFetch<GhlAppointmentsResponse>(`/contacts/${ghlContactId}/appointments`, apiKey);
  const events = data.events ?? data.appointments ?? [];
  let count = 0;
  for (const evt of events) {
    if (!evt.startTime) continue;
    const start = new Date(evt.startTime);
    const end = evt.endTime ? new Date(evt.endTime) : new Date(start.getTime() + 30 * 60_000);
    const row = {
      workspace_id: workspaceId,
      client_id: clientId,
      title: evt.title?.trim() || "Imported appointment",
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: (evt.appointmentStatus || "confirmed").toLowerCase(),
      location: evt.address ?? null,
      portal_visible: false,
      ...(evt.id ? { external_source: "ghl", external_id: evt.id } : {}),
    };
    if (evt.id) {
      const { data: inserted, error } = await supabase
        .from("appointments")
        .upsert(row, { onConflict: "workspace_id,external_source,external_id", ignoreDuplicates: true })
        .select("id");
      if (!error && inserted && inserted.length > 0) count++;
    } else {
      const { error } = await supabase.from("appointments").insert(row);
      if (!error) count++;
    }
  }
  return count;
}

async function importConversationsForContact(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  clientId: string,
  ghlContactId: string,
  locationId: string,
  apiKey: string
): Promise<number> {
  const search = await ghlFetch<GhlConversationsSearchResponse>(
    `/conversations/search?contactId=${ghlContactId}&locationId=${locationId}`,
    apiKey
  );
  let count = 0;
  for (const conv of search.conversations ?? []) {
    if (!conv.id) continue;
    // Regular (non-ignoreDuplicates) upsert so a re-run resolves back to the
    // same thread row by its GHL conversation id instead of creating a
    // duplicate thread each time -- messages below then dedupe against it.
    const { data: threadRow, error: threadError } = await supabase
      .from("message_threads")
      .upsert(
        {
          workspace_id: workspaceId,
          entity_type: "client",
          entity_id: clientId,
          channel: (conv.type || "sms").toLowerCase(),
          status: "closed",
          external_source: "ghl",
          external_id: conv.id,
        },
        { onConflict: "workspace_id,external_source,external_id" }
      )
      .select("id")
      .single();
    if (threadError || !threadRow) continue;

    const msgData = await ghlFetch<GhlMessagesResponse>(`/conversations/${conv.id}/messages`, apiKey);
    const messages = Array.isArray(msgData.messages) ? msgData.messages : msgData.messages?.messages ?? [];
    for (const m of messages) {
      const body = m.body?.trim();
      if (!body) continue;
      const row = {
        workspace_id: workspaceId,
        thread_id: threadRow.id,
        sender_type: m.direction === "inbound" ? "client" : "staff",
        body,
        is_internal: false,
        ...(m.dateAdded ? { created_at: m.dateAdded } : {}),
        ...(m.id ? { external_source: "ghl", external_id: m.id } : {}),
      };
      if (m.id) {
        const { data: inserted, error } = await supabase
          .from("messages")
          .upsert(row, { onConflict: "workspace_id,external_source,external_id", ignoreDuplicates: true })
          .select("id");
        if (!error && inserted && inserted.length > 0) count++;
      } else {
        const { error } = await supabase.from("messages").insert(row);
        if (!error) count++;
      }
    }
  }
  return count;
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

    let customFieldDefs: Record<string, string> = {};
    if (body.importCustomFields) {
      const { data: connRows } = await supabase.rpc("get_workspace_ghl_connection", { p_workspace_id: workspace.id });
      const connection = connRows?.[0];
      if (connection?.api_key && connection?.location_id) {
        try {
          const defs = await ghlFetch<GhlCustomFieldsResponse>(
            `/locations/${connection.location_id}/customFields`,
            connection.api_key
          );
          customFieldDefs = Object.fromEntries(
            (defs.customFields ?? []).filter((f) => f.id).map((f) => [f.id as string, f.name || f.fieldKey || f.key || f.id!])
          );
        } catch {
          // Custom field definitions are a nice-to-have label lookup -- if this
          // fails (e.g. the token lacks that scope), values still import keyed
          // by GHL's raw field id instead of a human-readable name.
        }
      }
    }

    return NextResponse.json({ ok: true, pausedAutomationIds, customFieldDefs });
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

  const wantsExtras = Boolean(body.importNotes || body.importTasks || body.importAppointments || body.importConversations);
  const pageLimit = wantsExtras ? PAGE_LIMIT_WITH_EXTRAS : PAGE_LIMIT_CONTACTS_ONLY;

  const params = new URLSearchParams({ locationId: connection.location_id, limit: String(pageLimit) });
  if (body.cursor?.startAfterId) params.set("startAfterId", body.cursor.startAfterId);
  if (body.cursor?.startAfter) params.set("startAfter", String(body.cursor.startAfter));

  let page: GhlContactsResponse;
  try {
    page = await ghlFetch<GhlContactsResponse>(`/contacts/?${params.toString()}`, connection.api_key);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach GoHighLevel";
    return NextResponse.json({ ok: false, error: `Could not fetch contacts from GoHighLevel: ${message}` }, { status: 502 });
  }

  const contacts = page.contacts ?? [];
  if (contacts.length === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      skippedTagFilter: 0,
      notesImported: 0,
      tasksImported: 0,
      appointmentsImported: 0,
      conversationsImported: 0,
      customFieldsSet: 0,
      hasMore: false,
      nextCursor: null,
    });
  }

  const filterTags = new Set((body.filterTags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean));
  const customFieldDefs = body.customFieldDefs ?? {};

  let imported = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;
  let skippedTagFilter = 0;
  let notesImported = 0;
  let tasksImported = 0;
  let appointmentsImported = 0;
  let conversationsImported = 0;
  let customFieldsSet = 0;
  const errors: string[] = [];
  const tagsSeen = new Set<string>();

  for (const contact of contacts) {
    const email = contact.email?.trim() || undefined;
    const phone = contact.phone?.trim() || undefined;
    if (!email && !phone) {
      skippedInvalid++;
      continue;
    }

    const ghlTags = (contact.tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (filterTags.size > 0 && !ghlTags.some((t) => filterTags.has(t.toLowerCase()))) {
      skippedTagFilter++;
      continue;
    }

    const { firstName, lastName } = splitName(contact);
    const isBusiness = !firstName && !lastName && Boolean(contact.companyName);
    // GHL allows a contact with no first/last/company name at all -- e.g. the
    // auto-generated placeholder contacts some POS integrations create for a
    // one-off payment. clients_check1 requires an individual to have at
    // least a first or last name, so fall back to the email's local part
    // rather than fail the whole row.
    const fallbackLastName = !isBusiness && !firstName && !lastName ? email?.split("@")[0] || "Unnamed" : undefined;

    const { data: createResult, error: createError } = await supabase.rpc("create_client", {
      p_workspace_id: workspace.id,
      p_client_type: isBusiness ? "business" : "individual",
      p_first_name: isBusiness ? undefined : firstName,
      p_last_name: isBusiness ? undefined : lastName ?? fallbackLastName,
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
    if (!result?.client_id) {
      errors.push(`${email || phone || contact.id || "unknown contact"}: create_client returned no client`);
      continue;
    }

    if (result.is_new) {
      const tags = Array.from(new Set([...ghlTags, IMPORT_TAG]));
      for (const t of tags) tagsSeen.add(t);

      const { error: tagError } = await supabase.from("clients").update({ tags }).eq("id", result.client_id);
      if (tagError) {
        errors.push(`${email || phone}: created but couldn't set tags -- ${tagError.message}`);
      }
      imported++;
    } else {
      skippedDuplicate++;
    }

    // Sub-resource extras attach to whichever client this GHL contact
    // resolved to -- the newly-created one, or an existing match by
    // email/phone -- since either way it's genuinely the same person's
    // history to bring in.
    if (body.importCustomFields && contact.customFields && contact.customFields.length > 0) {
      const values: Record<string, unknown> = {};
      for (const cf of contact.customFields) {
        if (!cf.id || cf.value === undefined || cf.value === null || cf.value === "") continue;
        values[customFieldDefs[cf.id] ?? cf.id] = cf.value;
      }
      if (Object.keys(values).length > 0) {
        const { data: existingClient } = await supabase.from("clients").select("custom_fields").eq("id", result.client_id).maybeSingle();
        const merged = { ...(existingClient?.custom_fields as Record<string, unknown> | null), ...values };
        const { error: cfError } = await supabase.from("clients").update({ custom_fields: merged as never }).eq("id", result.client_id);
        if (!cfError) customFieldsSet++;
      }
    }

    if (contact.id) {
      const tasksToRun: Promise<void>[] = [];
      if (body.importNotes) {
        tasksToRun.push(
          importNotesForContact(supabase, workspace.id, result.client_id, contact.id, connection.api_key)
            .then((n) => {
              notesImported += n;
            })
            .catch((err) => {
              errors.push(`${email || phone} notes: ${err instanceof Error ? err.message : "failed"}`);
            })
        );
      }
      if (body.importTasks) {
        tasksToRun.push(
          importTasksForContact(supabase, workspace.id, result.client_id, contact.id, connection.api_key)
            .then((n) => {
              tasksImported += n;
            })
            .catch((err) => {
              errors.push(`${email || phone} tasks: ${err instanceof Error ? err.message : "failed"}`);
            })
        );
      }
      if (body.importAppointments) {
        tasksToRun.push(
          importAppointmentsForContact(supabase, workspace.id, result.client_id, contact.id, connection.api_key)
            .then((n) => {
              appointmentsImported += n;
            })
            .catch((err) => {
              errors.push(`${email || phone} appointments: ${err instanceof Error ? err.message : "failed"}`);
            })
        );
      }
      if (body.importConversations) {
        tasksToRun.push(
          importConversationsForContact(supabase, workspace.id, result.client_id, contact.id, connection.location_id, connection.api_key)
            .then((n) => {
              conversationsImported += n;
            })
            .catch((err) => {
              errors.push(`${email || phone} conversations: ${err instanceof Error ? err.message : "failed"}`);
            })
        );
      }
      if (tasksToRun.length > 0) await Promise.all(tasksToRun);
    }
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
    skippedTagFilter,
    notesImported,
    tasksImported,
    appointmentsImported,
    conversationsImported,
    customFieldsSet,
    errors,
    hasMore: contacts.length === pageLimit && Boolean(nextCursor),
    nextCursor,
  });
}
