import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { BrandCenterForm } from "./BrandCenterForm";

export const dynamic = 'force-dynamic';

export default async function BrandCenterPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: branding } = await supabase
    .from("branding")
    .select("display_name, dba, primary_color, secondary_color, accent_color, support_email, support_phone")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Brand Center</h2>
      <p className="mt-1 text-sm text-muted">
        How your firm appears across the app and client portal.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <BrandCenterForm workspaceId={workspace.id} branding={branding ?? null} />
      </div>
    </div>
  );
}
