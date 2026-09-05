import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace } from "@/lib/workspace";

// Assigns (or clears, with clientId: null) which client a workspace's phone
// number sends/receives for. Writes go through the service client because
// workspace_phone_numbers has no client-writable RLS policy -- only
// provisioning and billing touch it directly otherwise.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`phone-number-assign:${user.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }
  if (!workspace.is_owner) {
    return NextResponse.json({ error: "Only the workspace owner can reassign phone numbers." }, { status: 403 });
  }

  const { phoneNumberId, clientId } = (await request.json()) as { phoneNumberId?: string; clientId?: string | null };
  if (!phoneNumberId) {
    return NextResponse.json({ error: "phoneNumberId is required" }, { status: 400 });
  }

  const service = createServiceClient();

  // A client can only be assigned to one number at a time -- clear any
  // existing assignment for this client before setting the new one, so
  // reassigning doesn't leave two numbers both pointed at the same client.
  if (clientId) {
    await service.from("workspace_phone_numbers").update({ assigned_client_id: null }).eq("workspace_id", workspace.id).eq("assigned_client_id", clientId);
  }

  const { error } = await service
    .from("workspace_phone_numbers")
    .update({ assigned_client_id: clientId ?? null })
    .eq("id", phoneNumberId)
    .eq("workspace_id", workspace.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
