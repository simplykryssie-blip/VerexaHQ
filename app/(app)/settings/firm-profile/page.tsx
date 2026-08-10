import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Building2, FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { FirmContactForm } from "./FirmContactForm";

export const dynamic = 'force-dynamic';

export default async function FirmProfilePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: profile }, { data: contact }] = await Promise.all([
    supabase
      .from("firm_tax_profile")
      .select("ein_last4, efin_last4, ptin_last4, supported_filing_states, updated_at")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select("phone, website, mailing_address, primary_contact_email")
      .eq("id", workspace.id)
      .single(),
  ]);

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={Building2}
        title="Firm Profile"
        description="Your firm's tax practice identifiers. EIN/EFIN/PTIN are encrypted -- only the last 4 digits are ever shown here."
      />

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        {!profile ? (
          <EmptyState icon={FileText} message="No firm tax profile set up yet." />
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

      {workspace.is_owner && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Contact information</h3>
          <div className="mt-3 rounded-xl border border-border bg-surface p-5">
            <FirmContactForm
              workspaceId={workspace.id}
              contact={
                contact ?? { phone: null, website: null, mailing_address: null, primary_contact_email: null }
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
