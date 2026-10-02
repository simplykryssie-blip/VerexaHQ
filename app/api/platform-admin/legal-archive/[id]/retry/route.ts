import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { retryPlatformTermsArchive } from "@/lib/legal/archive";
import { hasAal2 } from "@/lib/auth/requireAal2";

// Admin-only: retries a failed (or stuck-pending) legal-acceptance archive.
// Authorization is checked here explicitly (not just relied on via RLS),
// since the actual regeneration runs through the service-role client in
// retryPlatformTermsArchive, which bypasses RLS entirely.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (!isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // VEREXA-AAL-001: platform-admin-level action -- a password-only session
  // must not be sufficient on its own.
  if (!(await hasAal2(supabase))) {
    return NextResponse.json(
      { error: "This action requires two-factor verification. Complete your authenticator challenge and try again." },
      { status: 403 }
    );
  }

  const result = await retryPlatformTermsArchive(params.id);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  }
  return NextResponse.json({ status: result.status });
}
