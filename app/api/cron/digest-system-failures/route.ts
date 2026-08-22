import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmailViaResend } from "@/lib/email/resend";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATCH_SIZE = 200;
const DIGEST_RECIPIENT = "failedsystem@verexahq.com";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Drains system_failure_log (see lib/systemFailures.ts) into one digest
// email every run instead of one email per failure -- a bad Resend key or
// a systemic bug shouldn't be able to flood this inbox.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: failures, error: queryError } = await supabase
    .from("system_failure_log")
    .select("id, source, workspace_id, message, context, created_at")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queryError) {
    console.error("digest-system-failures: could not query system_failure_log", queryError);
    return NextResponse.json({ digested: 0, queryError: queryError.message }, { status: 200 });
  }

  if (!failures || failures.length === 0) {
    return NextResponse.json({ digested: 0 });
  }

  const workspaceIds = Array.from(new Set(failures.map((f) => f.workspace_id).filter((id): id is string => Boolean(id))));
  const { data: workspaces } = workspaceIds.length > 0 ? await supabase.from("workspaces").select("id, name").in("id", workspaceIds) : { data: [] };
  const workspaceNameById = new Map((workspaces ?? []).map((w) => [w.id, w.name]));

  const rows = failures
    .map((f) => {
      const workspaceLabel = f.workspace_id ? workspaceNameById.get(f.workspace_id) ?? f.workspace_id : "--";
      return `<tr>
        <td style="padding:6px 10px;border:1px solid #ddd;white-space:nowrap;">${escapeHtml(new Date(f.created_at).toISOString())}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;white-space:nowrap;">${escapeHtml(f.source)}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;white-space:nowrap;">${escapeHtml(workspaceLabel)}</td>
        <td style="padding:6px 10px;border:1px solid #ddd;">${escapeHtml(f.message)}</td>
      </tr>`;
    })
    .join("");

  const html = `<p>${failures.length} system-level failure${failures.length === 1 ? "" : "s"} since the last digest.</p>
    <table style="border-collapse:collapse;font:13px monospace;">
      <thead><tr>
        <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">When</th>
        <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Source</th>
        <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Workspace</th>
        <th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Message</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  const result = await sendEmailViaResend({
    to: DIGEST_RECIPIENT,
    subject: `Verexa: ${failures.length} system failure${failures.length === 1 ? "" : "s"}`,
    html,
    sender: "noreply",
  });

  if (!result.sent) {
    // Leave every row unmarked -- they'll roll into the next digest
    // attempt instead of being silently dropped.
    console.error("digest-system-failures: could not send the digest email", result.error ?? result.reason);
    return NextResponse.json({ digested: 0, sendError: result.error ?? result.reason }, { status: 200 });
  }

  const { error: markErr } = await supabase
    .from("system_failure_log")
    .update({ notified_at: new Date().toISOString() })
    .in("id", failures.map((f) => f.id));
  if (markErr) console.error("digest-system-failures: sent the digest but could not mark rows notified", markErr);

  return NextResponse.json({ digested: failures.length });
}
