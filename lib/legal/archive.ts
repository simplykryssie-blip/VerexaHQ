import { createServiceClient } from "@/lib/supabase/service";
import { renderCurrentLegalContentSnapshot } from "@/lib/legal/renderLegalContentSnapshot";
import { renderLegalAcceptancePdf } from "@/lib/documents/renderLegalAcceptancePdf";

type ArchiveRow = {
  id: string;
  consent_record_id: string;
  workspace_id: string;
  user_id: string | null;
  version: string;
  accepted_at: string;
  terms_content_snapshot: string;
  privacy_content_snapshot: string;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  status: "pending" | "generated" | "failed";
  generation_error: string | null;
};

function effectiveDateLabel(version: string): string {
  const d = new Date(`${version}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return version;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function storagePath(workspaceId: string, version: string, archiveId: string): string {
  return `workspace/${workspaceId}/legal/${version}/${archiveId}.pdf`;
}

// Never throws -- any failure results in a best-effort 'failed' row rather
// than propagating, since a customer's legal acceptance (consent_records)
// must never be affected by archive/PDF trouble.
async function renderAndStorePdf(service: ReturnType<typeof createServiceClient>, archive: ArchiveRow): Promise<void> {
  try {
    const [{ data: workspace }, { data: profile }, { data: authUser }] = await Promise.all([
      service.from("workspaces").select("name").eq("id", archive.workspace_id).maybeSingle(),
      archive.user_id ? service.from("user_profiles").select("display_name").eq("id", archive.user_id).maybeSingle() : Promise.resolve({ data: null }),
      archive.user_id ? service.auth.admin.getUserById(archive.user_id) : Promise.resolve({ data: { user: null } }),
    ]);

    const pdfBytes = await renderLegalAcceptancePdf({
      archiveId: archive.id,
      version: archive.version,
      effectiveDateLabel: effectiveDateLabel(archive.version),
      workspaceName: workspace?.name ?? "--",
      acceptedByName: profile?.display_name ?? "--",
      acceptedByEmail: authUser?.user?.email ?? "--",
      acceptedAtLabel: new Date(archive.accepted_at).toLocaleString(),
      termsHtml: archive.terms_content_snapshot,
      privacyHtml: archive.privacy_content_snapshot,
    });

    const path = archive.pdf_storage_path ?? storagePath(archive.workspace_id, archive.version, archive.id);
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
    const { error: uploadError } = await service.storage.from("legal-archives").upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    await service
      .from("platform_terms_acceptance_archive")
      .update({
        pdf_storage_path: path,
        pdf_generated_at: new Date().toISOString(),
        status: "generated",
        generation_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", archive.id);
  } catch (err) {
    // Internal diagnostic detail only -- never surfaced to a customer-facing
    // UI, which shows a plain "couldn't generate yet" status instead.
    const message = err instanceof Error ? err.message : String(err);
    await service
      .from("platform_terms_acceptance_archive")
      .update({ status: "failed", generation_error: message, updated_at: new Date().toISOString() })
      .eq("id", archive.id);
  }
}

// Called immediately after accept_platform_terms succeeds. consent_records
// is already the durable record of acceptance at this point -- everything
// here is best-effort preservation on top of it, and any failure here must
// never be allowed to look like a failed acceptance to the caller.
export async function runPlatformTermsArchiveGeneration({
  consentRecordId,
  workspaceId,
  userId,
  version,
  acceptedAt,
}: {
  consentRecordId: string;
  workspaceId: string;
  userId: string;
  version: string;
  acceptedAt: string;
}): Promise<void> {
  const service = createServiceClient();

  const { termsHtml, privacyHtml } = renderCurrentLegalContentSnapshot();

  // Idempotent: a retried/duplicated call for the same consent record must
  // not create a second archive row. If one already exists (from an earlier
  // attempt in this same acceptance), pick it back up instead of inserting.
  const { data: inserted } = await service
    .from("platform_terms_acceptance_archive")
    .insert({
      consent_record_id: consentRecordId,
      workspace_id: workspaceId,
      user_id: userId,
      version,
      accepted_at: acceptedAt,
      terms_content_snapshot: termsHtml,
      privacy_content_snapshot: privacyHtml,
      status: "pending",
    })
    .select()
    .maybeSingle();

  let archive = inserted as ArchiveRow | null;
  if (!archive) {
    const { data: existing } = await service
      .from("platform_terms_acceptance_archive")
      .select()
      .eq("consent_record_id", consentRecordId)
      .maybeSingle();
    archive = existing as ArchiveRow | null;
  }
  if (!archive || archive.status === "generated") return;

  await renderAndStorePdf(service, archive);
}

export type RetryResult = { status: "generated" | "failed" | "not_found" | "already_generated" };

// Admin-triggered retry for a failed (or stuck-pending) archive. Reuses the
// snapshots captured at the original acceptance -- never re-renders the
// current /terms or /privacy pages -- so a retried archive is historically
// identical to what it would have been had generation succeeded the first
// time. A no-op (not a re-generation) if the archive already succeeded, so
// retrying twice, or retrying after a concurrent success, never overwrites a
// good historical PDF.
export async function retryPlatformTermsArchive(archiveId: string): Promise<RetryResult> {
  const service = createServiceClient();
  const { data: archive } = await service.from("platform_terms_acceptance_archive").select().eq("id", archiveId).maybeSingle();
  if (!archive) return { status: "not_found" };
  if (archive.status === "generated") return { status: "already_generated" };

  await renderAndStorePdf(service, archive as ArchiveRow);

  const { data: after } = await service.from("platform_terms_acceptance_archive").select("status").eq("id", archiveId).maybeSingle();
  return { status: (after?.status as "generated" | "failed") ?? "failed" };
}
