import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace, workspaceOperationalError, isWorkspaceStatusOperational } from "@/lib/workspace";

// Contact Sharing Phase 3. Mirrors the existing engagement-shares approve
// route's split: respond_to_contact_share() flips the share's status
// under the caller's own session (so its has_permission checks are
// real); execute_contact_share_transfer() -- also under the caller's own
// session -- is the sole durable-database-mutation point (Invariant 3)
// and never touches Storage itself, only returning a deterministic
// {transfer_id, source_path, destination_path} plan; the physical byte
// copy happens here, under the service role, because the destination
// (ERO) session can never legitimately read the source (PTIN) workspace's
// folder under normal RLS -- exactly the same reason copy_shared_engagement's
// own approve route needs the service role for this one step.
//
// Unlike that existing route, this one is retry-safe: before copying, it
// checks whether the destination object already exists (a prior attempt
// may have copied the bytes but crashed before confirming), and only
// confirms via mark_contact_document_transferred() after the object is
// verified present -- so a retry never re-copies unnecessarily and never
// leaves the system claiming a transfer succeeded when it didn't.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isWorkspaceStatusOperational(workspace.status)) {
    return NextResponse.json({ error: workspaceOperationalError(workspace) }, { status: 403 });
  }

  const { decisionNotes } = (await request.json().catch(() => ({}))) as { decisionNotes?: string };

  const supabase = createClient();
  const { error: respondError } = await supabase.rpc("respond_to_contact_share", {
    p_share_id: params.id,
    p_decision: "approve",
    p_notes: decisionNotes ?? undefined,
  });
  if (respondError) {
    return NextResponse.json({ error: respondError.message }, { status: 400 });
  }

  const { data: plan, error: transferError } = await supabase.rpc("execute_contact_share_transfer", {
    p_share_id: params.id,
  });
  if (transferError) {
    return NextResponse.json({ error: transferError.message }, { status: 400 });
  }

  const documentPlan = (plan ?? []) as { transfer_id: string; source_path: string; destination_path: string }[];
  const serviceClient = createServiceClient();
  const failures: string[] = [];
  let copied = 0;

  for (const doc of documentPlan) {
    const lastSlash = doc.destination_path.lastIndexOf("/");
    const folder = doc.destination_path.slice(0, lastSlash);
    const fileName = doc.destination_path.slice(lastSlash + 1);

    const { data: existing } = await serviceClient.storage.from("client-documents").list(folder, { search: fileName });
    const alreadyCopied = (existing ?? []).some((entry) => entry.name === fileName);

    if (!alreadyCopied) {
      const { error: copyError } = await serviceClient.storage.from("client-documents").copy(doc.source_path, doc.destination_path);
      if (copyError) {
        failures.push(doc.source_path);
        continue;
      }
    }

    const { error: confirmError } = await supabase.rpc("mark_contact_document_transferred", { p_transfer_id: doc.transfer_id });
    if (confirmError) {
      failures.push(doc.source_path);
      continue;
    }
    copied += 1;
  }

  return NextResponse.json({ ok: true, copiedFiles: copied, failedFiles: failures });
}
