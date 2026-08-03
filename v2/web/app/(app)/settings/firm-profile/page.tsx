import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";

export default async function FirmProfilePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: profile } = await supabase
    .from("firm_tax_profile")
    .select("ein_last4, efin_last4, ptin_last4, supported_filing_states, updated_at")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Firm Profile</h2>
      <p className="mt-1 text-sm text-muted">
        Your firm&apos;s tax practice identifiers. EIN/EFIN/PTIN are encrypted -- only the last 4 digits are
        ever shown here.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        {!profile ? (
          <EmptyState message="No firm tax profile set up yet." />
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Workspace name</dt>
              <dd className="mt-0.5 text-slate">{workspace.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">EIN</dt>
              <dd className="mt-0.5 text-slate">{profile.ein_last4 ? `••••${profile.ein_last4}` : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">EFIN</dt>
              <dd className="mt-0.5 text-slate">{profile.efin_last4 ? `••••${profile.efin_last4}` : "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">PTIN</dt>
              <dd className="mt-0.5 text-slate">{profile.ptin_last4 ? `••••${profile.ptin_last4}` : "Not set"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted">Supported filing states</dt>
              <dd className="mt-0.5 text-slate">
                {profile.supported_filing_states && profile.supported_filing_states.length > 0
                  ? profile.supported_filing_states.join(", ")
                  : "None set"}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        Editing EIN/EFIN/PTIN requires the audit-logged reveal/update flow and isn&apos;t available in this
        view yet.
      </p>
    </div>
  );
}
