import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace } from "@/lib/workspace";

// Approving a shared engagement is the one point where the copy into the
// ERO's workspace actually happens. The status flip + copy RPCs run under
// the caller's own session (so the has_permission checks inside them are
// real), but the physical storage-object copy has to run under the service
// role -- storage RLS keys off the workspace_id folder in the path, so the
// ERO's own session can never read the PTIN's original file to copy it.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { decisionNotes } = (await request.json().catch(() => ({}))) as { decisionNotes?: string };

  const supabase = createClient();
  const { error: respondError } = await supabase.rpc("respond_to_engagement_share", {
    p_engagement_share_id: params.id,
    p_approve: true,
    p_decision_notes: decisionNotes ?? undefined,
  });
  if (respondError) {
    return NextResponse.json({ error: respondError.message }, { status: 400 });
  }

  const { data: paths, error: copyError } = await supabase.rpc("copy_shared_engagement", { p_engagement_share_id: params.id });
  if (copyError) {
    return NextResponse.json({ error: copyError.message }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const pathPairs = (paths ?? []) as { old_path: string; new_path: string }[];
  const failures: string[] = [];

  for (const pair of pathPairs) {
    const { error: storageError } = await serviceClient.storage.from("client-documents").copy(pair.old_path, pair.new_path);
    if (storageError) failures.push(pair.old_path);
  }

  return NextResponse.json({ ok: true, copiedFiles: pathPairs.length - failures.length, failedFiles: failures });
}
