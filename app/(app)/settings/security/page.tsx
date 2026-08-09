import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";
import { SecurityForm } from "./SecurityForm";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { MfaSetup } from "./MfaSetup";

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canManageSecurity } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "security.manage",
  });

  if (canManageSecurity) {
    await supabase.rpc("ensure_workspace_security_policy", { p_workspace_id: workspace.id });
  }

  const { data: policy } = await supabase
    .from("workspace_security_policies")
    .select("*")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Security</h2>
      <p className="mt-1 text-sm text-muted">Your account password and this workspace&apos;s security policy.</p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Change your password</h3>
        <p className="mt-1 text-sm text-muted">Update the password for your own account.</p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Two-factor authentication</h3>
        <p className="mt-1 text-sm text-muted">Protect your own account with an authenticator app.</p>
        <div className="mt-4">
          <MfaSetup />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Workspace security policy</h3>
        <p className="mt-1 text-sm text-muted">Password, session, lockout, and MFA policy for everyone in this workspace.</p>
        <div className="mt-4">
          {!policy ? (
            <EmptyState message="No security policy configured yet -- defaults apply." />
          ) : (
            <SecurityForm workspaceId={workspace.id} policy={policy} />
          )}
        </div>
      </div>
    </div>
  );
}
