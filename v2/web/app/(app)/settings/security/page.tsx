import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";
import { SecurityForm } from "./SecurityForm";

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: policy } = await supabase
    .from("workspace_security_policies")
    .select("*")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Security</h2>
      <p className="mt-1 text-sm text-muted">
        Password, session, lockout, and MFA policy for this workspace.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        {!policy ? (
          <EmptyState message="No security policy configured yet -- defaults apply." />
        ) : (
          <SecurityForm workspaceId={workspace.id} policy={policy} />
        )}
      </div>
    </div>
  );
}
