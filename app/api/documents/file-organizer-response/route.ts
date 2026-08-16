import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { formatAddressValue, formatNameValue } from "@/lib/organizer/formatValue";

function displayValue(fieldType: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "--";
  // ssn/ein are permission-gated + audit-logged via reveal_organizer_answer()
  // everywhere else in the app -- the filed summary must not become a way
  // to read them in cleartext without going through that control.
  if (fieldType === "ssn" || fieldType === "ein") {
    const digits = String(raw).replace(/\D/g, "");
    return digits.length >= 4 ? `****${digits.slice(-4)}` : "on file";
  }
  if (fieldType === "signature" && typeof raw === "object") {
    const sig = raw as { typed_name?: string; signed_at?: string };
    return sig.typed_name ? `Signed by ${sig.typed_name}${sig.signed_at ? ` on ${new Date(sig.signed_at).toLocaleDateString()}` : ""}` : "Signed";
  }
  if (fieldType === "name") return formatNameValue(raw);
  if (fieldType === "address") return formatAddressValue(raw);
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

// StandardFonts only support WinAnsi-encodable characters -- a client typing
// an emoji or non-Latin script into a free-text answer would otherwise throw
// and fail the whole filing step, so anything outside that range is dropped
// to "?" rather than crashing the request.
function sanitizeForPdf(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code <= 0xff && code !== 0x7f ? ch : "?";
    })
    .join("");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const LINE_HEIGHT = 13;

async function buildOrganizerPdf(
  templateName: string,
  submittedLabel: string,
  rows: { label: string; value: string }[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  ensureSpace(20);
  page.drawText(sanitizeForPdf(templateName), { x: MARGIN, y: y - 18, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  y -= 32;

  ensureSpace(LINE_HEIGHT);
  page.drawText(sanitizeForPdf(`Submitted ${submittedLabel}`), { x: MARGIN, y: y - 10, size: 10, font, color: rgb(0.45, 0.45, 0.45) });
  y -= LINE_HEIGHT + 14;

  for (const row of rows) {
    const label = sanitizeForPdf(row.label);
    const valueLines = wrapText(sanitizeForPdf(row.value), font, 10, CONTENT_WIDTH);

    ensureSpace(LINE_HEIGHT);
    page.drawText(label, { x: MARGIN, y: y - 10, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
    y -= LINE_HEIGHT + 1;

    for (const line of valueLines) {
      ensureSpace(LINE_HEIGHT);
      page.drawText(line, { x: MARGIN, y: y - 10, size: 10, font, color: rgb(0.25, 0.25, 0.25) });
      y -= LINE_HEIGHT;
    }

    y -= 6;
    ensureSpace(1);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
    y -= 8;
  }

  return pdfDoc.save();
}

// Called right after an organizer response is actually completed (public
// intake link or the client-portal self-fill flow) so the answers show up
// as a document in the client's Documents instead of only living in
// organizer_response_answers. Answers are re-fetched server-side by
// response id, same trust model as file-signed-engagement-letter.
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`file-organizer-response:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { responseId } = await request.json().catch(() => ({ responseId: null }));
  if (typeof responseId !== "string") {
    return NextResponse.json({ error: "responseId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: response } = await supabase
    .from("organizer_responses")
    .select("id, workspace_id, client_id, status, submitted_at, filed_as_attachment, organizer_templates(name)")
    .eq("id", responseId)
    .maybeSingle();

  if (!response) {
    return NextResponse.json({ error: "Organizer response not found" }, { status: 404 });
  }
  if (response.status !== "submitted" && response.status !== "reviewed") {
    return NextResponse.json({ error: "This organizer has not been submitted yet" }, { status: 400 });
  }
  if (response.filed_as_attachment) {
    return NextResponse.json({ ok: true, alreadyFiled: true });
  }

  const { data: answers } = await supabase
    .from("organizer_response_answers")
    .select("value, instance_index, organizer_fields(label, field_type, display_order)")
    .eq("organizer_response_id", responseId);

  const rows = (answers ?? [])
    .map((a) => {
      const field = a.organizer_fields as unknown as { label: string; field_type: string; display_order: number } | null;
      if (!field) return null;
      return { order: field.display_order, instance: a.instance_index, label: field.label, value: displayValue(field.field_type, a.value) };
    })
    .filter((r): r is { order: number; instance: number; label: string; value: string } => r !== null)
    .sort((a, b) => a.order - b.order || a.instance - b.instance);

  const templateName = (response.organizer_templates as unknown as { name?: string } | null)?.name ?? "Organizer";
  const submittedLabel = response.submitted_at ? new Date(response.submitted_at).toLocaleDateString() : "";
  const pdfBytes = await buildOrganizerPdf(templateName, submittedLabel, rows);

  const fileName = `${templateName} (completed).pdf`;
  const path = `${response.workspace_id}/${response.client_id}/${Date.now()}-${fileName}`;
  const blob = new Blob([Buffer.from(pdfBytes)], { type: "application/pdf" });

  const { error: uploadErr } = await supabase.storage.from("client-documents").upload(path, blob, { contentType: "application/pdf" });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // client_visible: the client filled this organizer in themselves, so they
  // should be able to see and download their own submitted answers, same as
  // any other document shared with them.
  const { error: insertErr } = await supabase.from("attachments").insert({
    workspace_id: response.workspace_id,
    entity_type: "client",
    entity_id: response.client_id,
    file_name: fileName,
    storage_path: path,
    mime_type: "application/pdf",
    file_size_bytes: blob.size,
    visibility: "client_visible",
    category: "Other",
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await supabase.from("organizer_responses").update({ filed_as_attachment: true }).eq("id", responseId);

  return NextResponse.json({ ok: true });
}
