import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPlatformTermsArchiveGeneration } from "@/lib/legal/archive";

// Wraps the existing accept_platform_terms RPC (unchanged) so that, once
// consent_records has already recorded a real acceptance, this route can
// also kick off best-effort archive/PDF generation server-side -- something
// pdf-lib and the service-role storage write can't do from the browser
// client AcceptTermsGate used to call directly. If archive generation
// fails for any reason, the response below is unaffected: the acceptance
// itself already succeeded and is not rolled back.
export async function POST(request: Request) {
  let version: unknown;
  try {
    ({ version } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof version !== "string" || !version) {
    return NextResponse.json({ error: "Missing version" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error: acceptError } = await supabase.rpc("accept_platform_terms", { p_version: version });
  if (acceptError) {
    return NextResponse.json({ error: acceptError.message }, { status: 400 });
  }

  const { data: record } = await supabase
    .from("consent_records")
    .select("id, workspace_id, accepted_at")
    .eq("user_id", user.id)
    .eq("consent_type", "platform_terms")
    .eq("version", version)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (record?.workspace_id) {
    try {
      await runPlatformTermsArchiveGeneration({
        consentRecordId: record.id,
        workspaceId: record.workspace_id,
        userId: user.id,
        version,
        acceptedAt: record.accepted_at,
      });
    } catch {
      // Archive generation already records its own failure state internally
      // (platform_terms_acceptance_archive.status = 'failed'); acceptance
      // itself succeeded above and must be reported as such regardless.
    }
  }

  return NextResponse.json({ success: true });
}
