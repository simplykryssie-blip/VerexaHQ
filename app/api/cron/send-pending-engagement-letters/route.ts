import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { renderTemplate } from "@/lib/templates/render";
import { renderLetterPdf } from "@/lib/documents/renderLetterPdf";

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

  const { data: jobs } = await supabase
    .from("pending_engagement_letter_sends")
    .select("id, workspace_id, engagement_id, client_id, engagement_letter_template_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const result = await sendOne(supabase, job);
    if (result === "sent") sent++;
    else failed++;
  }

  return NextResponse.json({ processed: jobs?.length ?? 0, sent, failed });
}

async function sendOne(
  supabase: ReturnType<typeof createServiceClient>,
  job: { id: string; workspace_id: string; engagement_id: string; client_id: string; engagement_letter_template_id: string }
): Promise<"sent" | "failed"> {
  try {
    const [{ data: template }, { data: workspace }, { data: client }] = await Promise.all([
      supabase.from("engagement_letter_templates").select("id, name, body_html").eq("id", job.engagement_letter_template_id).single(),
      supabase.from("workspaces").select("name").eq("id", job.workspace_id).single(),
      supabase.from("clients").select("first_name, last_name, business_name, primary_email").eq("id", job.client_id).single(),
    ]);
    if (!template) throw new Error("Engagement letter template not found");

    const clientName = client?.business_name || [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "";
    const mergedHtml = renderTemplate(template.body_html, {
      client_name: clientName,
      firm_name: workspace?.name ?? "",
      firm_address: "",
      firm_phone: "",
    });
    // A rendered PDF, not raw HTML -- the signing page only knows how to
    // preview PDFs and images, and this gives the letter a real, visible
    // signature line instead of a bare "type your name" box with nothing
    // to sign underneath it.
    const pdfBytes = await renderLetterPdf(template.name, mergedHtml, clientName || "Client");

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
        category: "Engagement Letter",
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

    await supabase.from("pending_engagement_letter_sends").update({ status: "sent", processed_at: new Date().toISOString() }).eq("id", job.id);
    return "sent";
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown error";
    await supabase.from("pending_engagement_letter_sends").update({ status: "failed", error, processed_at: new Date().toISOString() }).eq("id", job.id);
    return "failed";
  }
}
