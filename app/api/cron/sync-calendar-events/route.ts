import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getValidAccessToken } from "@/lib/calendarSync/tokens";
import * as google from "@/lib/calendarSync/google";
import * as microsoft from "@/lib/calendarSync/microsoft";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const RETRY_BACKOFF_MINUTES = 5;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type Job = {
  id: string;
  appointment_id: string;
  staff_id: string;
  action: "upsert" | "delete";
  title: string | null;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  start_at: string | null;
  end_at: string | null;
  attempts: number;
  max_attempts: number;
};

type Connection = {
  id: string;
  provider: "google" | "microsoft";
  calendar_id: string;
  external_account_email: string | null;
};

// Drains calendar_sync_queue: for each pending appointment change, pushes it
// to every Google/Outlook calendar the assigned staff member has connected.
// Same queue+cron dispatch pattern as dispatch-notifications. Meant to be
// hit by a Vercel Cron job every few minutes; see vercel.json.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: jobs } = await supabase
    .from("calendar_sync_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  // Every job re-queried its own staff member's connections one at a time --
  // batch by the distinct staff_ids actually present in this batch instead.
  const staffIds = Array.from(new Set((jobs ?? []).map((j) => j.staff_id)));
  const { data: allConnections } =
    staffIds.length > 0
      ? await supabase
          .from("user_calendar_connections")
          .select("id, user_id, provider, calendar_id, external_account_email")
          .in("user_id", staffIds)
          .eq("status", "connected")
      : { data: [] as (Connection & { user_id: string })[] };
  const connectionsByStaffId = new Map<string, Connection[]>();
  for (const connection of (allConnections ?? []) as (Connection & { user_id: string })[]) {
    const list = connectionsByStaffId.get(connection.user_id) ?? [];
    list.push(connection);
    connectionsByStaffId.set(connection.user_id, list);
  }

  let sent = 0;
  let failed = 0;
  let retried = 0;

  for (const job of (jobs ?? []) as Job[]) {
    const result = await processJob(supabase, job, connectionsByStaffId.get(job.staff_id) ?? []);
    if (result === "sent") sent++;
    else if (result === "failed") failed++;
    else retried++;
  }

  return NextResponse.json({ processed: jobs?.length ?? 0, sent, failed, retried });
}

async function processJob(supabase: ReturnType<typeof createServiceClient>, job: Job, connections: Connection[]): Promise<"sent" | "failed" | "retry"> {
  if (!connections || connections.length === 0) {
    await supabase.from("calendar_sync_queue").update({ status: "sent" }).eq("id", job.id);
    return "sent";
  }

  let anyError = false;
  let lastError = "";
  for (const connection of connections) {
    const outcome = await syncOneConnection(supabase, job, connection);
    if (outcome.ok === false) {
      anyError = true;
      lastError = outcome.reason;
    }
  }

  if (!anyError) {
    await supabase.from("calendar_sync_queue").update({ status: "sent" }).eq("id", job.id);
    return "sent";
  }

  const attempts = job.attempts + 1;
  if (attempts >= job.max_attempts) {
    await supabase.from("calendar_sync_queue").update({ status: "failed", attempts, error: lastError }).eq("id", job.id);
    return "failed";
  }
  await supabase
    .from("calendar_sync_queue")
    .update({ attempts, error: lastError, scheduled_at: new Date(Date.now() + attempts * RETRY_BACKOFF_MINUTES * 60_000).toISOString() })
    .eq("id", job.id);
  return "retry";
}

async function syncOneConnection(
  supabase: ReturnType<typeof createServiceClient>,
  job: Job,
  connection: Connection
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const tokenResult = await getValidAccessToken(supabase, job.staff_id, connection.provider);
  // Not connected / revoked isn't a transient error worth retrying this
  // specific connection for -- treat it as nothing to do here.
  if (!tokenResult.ok) return { ok: true };

  const { data: mapping } = await supabase
    .from("appointment_external_events")
    .select("id, external_event_id")
    .eq("appointment_id", job.appointment_id)
    .eq("user_calendar_connection_id", connection.id)
    .maybeSingle();

  if (job.action === "delete") {
    if (!mapping) return { ok: true };
    const result =
      connection.provider === "google"
        ? await google.deleteGoogleEvent({ accessToken: tokenResult.accessToken, calendarId: connection.calendar_id, eventId: mapping.external_event_id })
        : await microsoft.deleteMicrosoftEvent({ accessToken: tokenResult.accessToken, eventId: mapping.external_event_id });
    if (!result.ok) return { ok: false, reason: result.reason };
    await supabase.from("appointment_external_events").delete().eq("id", mapping.id);
    return { ok: true };
  }

  if (!job.start_at || !job.end_at || !job.title) return { ok: true };
  const event = { title: job.title, description: job.description, location: job.location, startAtIso: job.start_at, endAtIso: job.end_at };

  if (mapping) {
    const result =
      connection.provider === "google"
        ? await google.updateGoogleEvent({ accessToken: tokenResult.accessToken, calendarId: connection.calendar_id, eventId: mapping.external_event_id, event })
        : await microsoft.updateMicrosoftEvent({ accessToken: tokenResult.accessToken, eventId: mapping.external_event_id, event });
    if (result.ok) {
      await supabase.from("appointment_external_events").update({ updated_at: new Date().toISOString() }).eq("id", mapping.id);
      return { ok: true };
    }
    // The far-side event was deleted by hand -- recreate it below instead
    // of treating this as a hard failure.
    if (result.reason !== "not_found") return { ok: false, reason: result.reason };
    await supabase.from("appointment_external_events").delete().eq("id", mapping.id);
  }

  const created =
    connection.provider === "google"
      ? await google.createGoogleEvent({ accessToken: tokenResult.accessToken, calendarId: connection.calendar_id, event })
      : await microsoft.createMicrosoftEvent({ accessToken: tokenResult.accessToken, event });
  if (!created.ok) return { ok: false, reason: created.reason };

  await supabase.from("appointment_external_events").insert({
    appointment_id: job.appointment_id,
    user_calendar_connection_id: connection.id,
    external_event_id: created.data.id,
  });
  return { ok: true };
}

export const GET = withJobLogging("sync-calendar-events", handleGET);
