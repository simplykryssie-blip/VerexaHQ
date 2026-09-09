import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/SectionCard";
import Link from "next/link";
import { IRS_AUTHORIZATION_STATUS_LABELS, IRS_AUTHORIZATION_STATUS_TONE, type IrsAuthorizationStatus } from "@/lib/irsAuthorizationStatus";
import type { IrsTaxMatterRow } from "@/lib/irsAuthorization/types";
import { IrsAuthorizationStatusPanel } from "./IrsAuthorizationStatusPanel";
import { CopySigningLinkButton } from "./CopySigningLinkButton";

export const dynamic = "force-dynamic";

function clientDisplayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function IrsAuthorizationDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canView } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "irs_authorizations.view",
  });
  if (!canView) {
    return (
      <>
        <PageHeader backHref="/irs-authorizations" backLabel="Back to IRS Authorizations" title="IRS Authorization" />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to view IRS authorizations." />
        </div>
      </>
    );
  }

  const { data: authorization } = await supabase
    .from("irs_authorizations")
    .select(
      `id, workspace_id, client_id, engagement_id, taxpayer_type, designee_name, designee_caf_number,
       tax_matters, status, staff_note, submitted_at, authorized_at, created_at,
       attachment_id, signature_request_id,
       clients(id, client_type, first_name, last_name, business_name)`
    )
    .eq("id", params.id)
    .eq("workspace_id", workspace.id)
    .single();

  if (!authorization) {
    return (
      <>
        <PageHeader backHref="/irs-authorizations" backLabel="Back to IRS Authorizations" title="IRS Authorization" />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="This IRS authorization couldn't be found." />
        </div>
      </>
    );
  }

  const client = authorization.clients as unknown as {
    id: string;
    client_type: string;
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
  };
  const taxMatters = (authorization.tax_matters ?? []) as IrsTaxMatterRow[];
  const status = authorization.status as IrsAuthorizationStatus;

  const [{ data: canManage }, { data: attachment }, { data: signer }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "irs_authorizations.manage" }),
    authorization.attachment_id
      ? supabase.from("attachments").select("storage_path, file_name").eq("id", authorization.attachment_id).single()
      : Promise.resolve({ data: null }),
    authorization.signature_request_id
      ? supabase
          .from("signature_request_signers")
          .select("access_token, status")
          .eq("signature_request_id", authorization.signature_request_id)
          .order("sign_order")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let documentUrl: string | null = null;
  if (attachment?.storage_path) {
    const { data: signed } = await supabase.storage.from("client-documents").createSignedUrl(attachment.storage_path, 300);
    documentUrl = signed?.signedUrl ?? null;
  }

  return (
    <>
      <PageHeader
        backHref={`/clients/${client.id}`}
        backLabel={`Back to ${clientDisplayName(client)}`}
        title="IRS Form 8821 Authorization"
        description={
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="capitalize">{authorization.taxpayer_type} taxpayer</span>
            <span>Designee: {authorization.designee_name}{authorization.designee_caf_number ? ` (CAF ${authorization.designee_caf_number})` : ""}</span>
            <Badge tone={IRS_AUTHORIZATION_STATUS_TONE[status]}>{IRS_AUTHORIZATION_STATUS_LABELS[status]}</Badge>
          </div>
        }
      />

      <div className="flex-1 space-y-6 px-8 py-6">
        <SectionCard title="Tax matters">
          {taxMatters.length === 0 ? (
            <EmptyState message="No tax matters recorded." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2 font-medium">Type of tax information</th>
                    <th className="px-4 py-2 font-medium">Tax form number</th>
                    <th className="px-4 py-2 font-medium">Year(s)/period(s)</th>
                    <th className="px-4 py-2 font-medium">Specific matters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {taxMatters.map((row, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-slate">{row.tax_info_type || "--"}</td>
                      <td className="px-4 py-2.5 text-slate">{row.tax_form_number || "--"}</td>
                      <td className="px-4 py-2.5 text-slate">{row.years_or_periods || "--"}</td>
                      <td className="px-4 py-2.5 text-slate">{row.specific_matters || "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Document & signature">
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Generated 8821 PDF</dt>
              <dd>
                {documentUrl ? (
                  <a href={documentUrl} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                    {attachment?.file_name ?? "View document"}
                  </a>
                ) : (
                  <span className="text-muted">Not generated yet</span>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Client signing link</dt>
              <dd>
                {signer?.access_token ? (
                  <div className="flex items-center gap-2">
                    <Badge tone={signer.status === "signed" ? "success" : "warning"} className="capitalize">
                      {signer.status ?? "pending"}
                    </Badge>
                    <CopySigningLinkButton accessToken={signer.access_token} />
                  </div>
                ) : (
                  <span className="text-muted">Not sent for signature yet</span>
                )}
              </dd>
            </div>
          </dl>
        </SectionCard>

        {authorization.staff_note && (
          <SectionCard title="Staff note">
            <p className="text-sm text-slate">{authorization.staff_note}</p>
          </SectionCard>
        )}

        <SectionCard title="Status">
          <IrsAuthorizationStatusPanel authorizationId={authorization.id} status={status} canManage={Boolean(canManage)} />
        </SectionCard>

        {authorization.engagement_id && (
          <p className="text-xs text-muted">
            Linked to <Link href={`/engagements/${authorization.engagement_id}`} className="text-accent hover:underline">this engagement</Link>.
          </p>
        )}
      </div>
    </>
  );
}
