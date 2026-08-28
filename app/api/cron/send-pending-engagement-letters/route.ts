import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { renderTemplate } from "@/lib/templates/render";
import { renderLetterPdf } from "@/lib/documents/renderLetterPdf";
import { renderPdfTemplate, type PdfFieldMapping } from "@/lib/documents/renderPdfTemplate";
import { reportSystemFailure } from "@/lib/systemFailures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 20;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// The "send_engagement_letter" automation action can only enqueue a row here
// -- execute_automation_step is pure SQL and can't call Supabase Storage.
// This drains that queue the same way dispatch-notifications drains
// notification_queue: render the template, upload it, and create the same
// attachments/signature_requests/signature_request_signers rows the manual
// "Form template" flow in SignaturesPanel.tsx creates via
// createSignatureRequestFromTemplate.ts, just from a service-role context
// instead of a signed-in staff member.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: jobs, error: queryError } = await supabase
    .from("pending_engagement_letter_sends")
    .select("id, workspace_id, engagement_id, client_id, engagement_letter_template_id, additional_signer_relationship_type")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queryError) {
    console.error("send-pending-engagement-letters: could not query pending_engagement_letter_sends", queryError);
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, queryError: queryError.message }, { status: 200 });
  }

  // Each job's template/workspace/client lookup is independent of the
  // others, so fetch all three sets once up front rather than three queries
  // per job -- a full batch used to cost up to 60 round trips just to read
  // data every job needs before it can even start rendering.
  const templateIds = Array.from(new Set((jobs ?? []).map((j) => j.engagement_letter_template_id)));
  const workspaceIds = Array.from(new Set((jobs ?? []).map((j) => j.workspace_id)));
  const clientIds = Array.from(new Set((jobs ?? []).map((j) => j.client_id)));

  const [{ data: templates }, { data: workspaces }, { data: clients }] = await Promise.all([
    templateIds.length > 0
      ? (supabase
          .from("engagement_letter_templates")
          .select("id, name, body_html, banner_image_url, source_type, pdf_storage_path, pdf_field_mode, pdf_field_mappings")
          .in("id", templateIds) as unknown as Promise<{ data: EngagementLetterTemplateRow[] | null }>)
      : Promise.resolve({ data: [] as EngagementLetterTemplateRow[] }),
    workspaceIds.length > 0
      ? supabase.from("workspaces").select("id, name").in("id", workspaceIds)
      : Promise.resolve({ data: [] as WorkspaceRow[] }),
    clientIds.length > 0
      ? supabase.from("clients").select("id, first_name, last_name, business_name, primary_email").in("id", clientIds)
      : Promise.resolve({ data: [] as ClientRow[] }),
  ]);

  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  const workspaceById = new Map((workspaces ?? []).map((w) => [w.id, w]));
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));

  let sent = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const result = await sendOneWithTimeout(supabase, job, {
      template: templateById.get(job.engagement_letter_template_id) ?? null,
      workspace: workspaceById.get(job.workspace_id) ?? null,
      client: clientById.get(job.client_id) ?? null,
    });
    if (result === "sent") sent++;
    else failed++;
  }

  return NextResponse.json({ processed: jobs?.length ?? 0, sent, failed });
}

type EngagementLetterTemplateRow = {
  id: string;
  name: string;
  body_html: string;
  banner_image_url: string | null;
  source_type: string;
  pdf_storage_path: string | null;
  pdf_field_mode: string | null;
  pdf_field_mappings: PdfFieldMapping[] | null;
};
type WorkspaceRow = { id: string; name: string | null };
type ClientRow = { id: string; first_name: string | null; last_name: string | null; business_name: string | null; primary_email: string | null };
type PrefetchedRows = { template: EngagementLetterTemplateRow | null; workspace: WorkspaceRow | null; client: ClientRow | null };

// See the identical guard in send-pending-portal-invites/route.ts: a hang in
// rendering/uploading/Storage can otherwise stall a job forever without ever
// throwing, leaving the row at 'pending' and blocking every later job behind
// it on every future cron cycle. Races sendOne against a hard deadline so a
// hang always turns into a real "failed" row instead of silent stagnation.
async function sendOneWithTimeout(
  supabase: ReturnType<typeof createServiceClient>,
  job: {
    id: string;
    workspace_id: string;
    engagement_id: string;
    client_id: string;
    engagement_letter_template_id: string;
    additional_signer_relationship_type: string | null;
  },
  prefetched: PrefetchedRows,
  timeoutMs = 25000
): Promise<"sent" | "failed"> {
  let timedOut = false;
  const timer = new Promise<"failed">((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve("failed");
    }, timeoutMs);
  });
  const result = await Promise.race([sendOne(supabase, job, prefetched), timer]);
  if (timedOut) {
    console.error(`send-pending-engagement-letters: job ${job.id} timed out after ${timeoutMs}ms`);
    await supabase
      .from("pending_engagement_letter_sends")
      .update({ status: "failed", error: `Timed out after ${timeoutMs}ms`, processed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending");
    await reportSystemFailure("send-pending-engagement-letters", `Job ${job.id} timed out after ${timeoutMs}ms`, {
      workspaceId: job.workspace_id,
      context: { jobId: job.id },
    });
  }
  return result;
}

async function sendOne(
  supabase: ReturnType<typeof createServiceClient>,
  job: {
    id: string;
    workspace_id: string;
    engagement_id: string;
    client_id: string;
    engagement_letter_template_id: string;
    additional_signer_relationship_type: string | null;
  },
  { template, workspace, client }: PrefetchedRows
): Promise<"sent" | "failed"> {
  try {
    if (!template) throw new Error("Document template not found");

    const clientName = client?.business_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "";
    const mergeValues = {
      client_name: clientName,
      firm_name: workspace?.name ?? "",
      firm_address: "",
      firm_phone: "",
    };

    let pdfBytes: Uint8Array;
    if (template.source_type === "pdf" && template.pdf_storage_path && template.pdf_field_mode) {
      const { data: sourceFile, error: downloadErr } = await supabase.storage.from("document-templates").download(template.pdf_storage_path);
      if (downloadErr || !sourceFile) throw new Error(downloadErr?.message ?? "Could not load the uploaded PDF for this document");
      pdfBytes = await renderPdfTemplate({
        sourceBytes: new Uint8Array(await sourceFile.arrayBuffer()),
        fieldMode: template.pdf_field_mode as "acroform" | "overlay",
        fieldMappings: template.pdf_field_mappings ?? [],
        values: mergeValues,
      });
    } else {
      const mergedHtml = renderTemplate(template.body_html, mergeValues);
      // A rendered PDF, not raw HTML -- the signing page only knows how to
      // preview PDFs and images, and this gives the letter a real, visible
      // signature line instead of a bare "type your name" box with nothing
      // to sign underneath it.
      pdfBytes = await renderLetterPdf(template.name, mergedHtml, clientName || "Client");
    }

    const fileName = `${template.name}.pdf`;
    const path = `${job.workspace_id}/${job.engagement_id}/${Date.now()}-${fileName}`;
    const blob = new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" });
    const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "application/pdf" });
    if (uploadErr) throw new Error(uploadErr.message);

    const { data: attachment, error: attachmentErr } = await supabase
      .from("attachments")
      .insert({
        workspace_id: job.workspace_id,
        entity_type: "engagement",
        entity_id: job.engagement_id,
        file_name: fileName,
        storage_path: path,
        mime_type: "application/pdf",
        file_size_bytes: blob.size,
        visibility: "internal",
        category: "Signed Document",
      })
      .select("id")
      .single();
    if (attachmentErr || !attachment) throw new Error(attachmentErr?.message ?? "Could not save the rendered letter");

    const { data: signatureRequest, error: requestErr } = await supabase
      .from("signature_requests")
      .insert({
        workspace_id: job.workspace_id,
        attachment_id: attachment.id,
        engagement_letter_template_id: template.id,
        title: template.name,
      })
      .select("id")
      .single();
    if (requestErr || !signatureRequest) throw new Error(requestErr?.message ?? "Could not create the signature request");

    if (clientName || client?.primary_email) {
      const { error: signerErr } = await supabase
        .from("signature_request_signers")
        .insert({ signature_request_id: signatureRequest.id, signer_name: clientName || "Client", signer_email: client?.primary_email ?? null, sign_order: 1 });
      if (signerErr) throw new Error(signerErr.message);
    }

    if (job.additional_signer_relationship_type) {
      const { data: relationship } = await supabase
        .from("client_relationships")
        .select("related_name, related_client_id")
        .eq("client_id", job.client_id)
        .eq("relationship_type", job.additional_signer_relationship_type)
        .order("display_order")
        .limit(1)
        .maybeSingle();

      if (relationship?.related_name) {
        let relatedEmail: string | null = null;
        if (relationship.related_client_id) {
          const { data: relatedClient } = await supabase
            .from("clients")
            .select("primary_email")
            .eq("id", relationship.related_client_id)
            .maybeSingle();
          relatedEmail = relatedClient?.primary_email ?? null;
        }
        const { error: additionalSignerErr } = await supabase
          .from("signature_request_signers")
          .insert({ signature_request_id: signatureRequest.id, signer_name: relationship.related_name, signer_email: relatedEmail, sign_order: 2 });
        // A missing/failed additional signer shouldn't fail the whole send --
        // the primary signer's request is already valid and usable.
        if (additionalSignerErr) console.error(`send-pending-engagement-letters: could not add additional signer for job ${job.id}`, additionalSignerErr);
      }
    }

    const { error: markSentErr } = await supabase
      .from("pending_engagement_letter_sends")
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", job.id);
    if (markSentErr) console.error(`send-pending-engagement-letters: sent letter for job ${job.id} but could not mark it sent`, markSentErr);
    return "sent";
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown error";
    const { error: markFailedErr } = await supabase
      .from("pending_engagement_letter_sends")
      .update({ status: "failed", error, processed_at: new Date().toISOString() })
      .eq("id", job.id);
    if (markFailedErr) console.error(`send-pending-engagement-letters: job ${job.id} failed (${error}) and could not be marked failed`, markFailedErr);

    // Every failure mode here (missing template, PDF render, storage
    // upload, or DB error) is internal to Verexa's own systems -- nothing
    // a workspace admin could fix on their end.
    await reportSystemFailure("send-pending-engagement-letters", error, { workspaceId: job.workspace_id, context: { jobId: job.id } });
    return "failed";
  }
}
