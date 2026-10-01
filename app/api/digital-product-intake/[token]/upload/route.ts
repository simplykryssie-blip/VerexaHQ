import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { uploadDigitalProductIntakeFile } from "@/lib/documents/uploadDigitalProductIntakeFile";

type FileConfig = { accept: string[]; multiple: boolean; max_files: number; max_size_bytes: number };

// Uploads a single file for the public digital-product intake form
// (/dpi/[token]) before final submission -- there is no logged-in user on
// this page to gate an insert policy against, so this runs server-side
// with the service role, same pattern as /api/o/[token]/signature-image.
// The only things the browser gets to choose are which of this form's own
// file_upload fields it's uploading to and the file bytes themselves;
// workspace_id/form_id come from the server-resolved public token, and the
// returned storage path is the only thing the final submission RPC will
// accept as a reference for that field.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const allowed = await checkRateLimit(`dpi-upload:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const fieldKey = form?.get("field_key");
  const uploadSessionId = form?.get("upload_session_id");

  if (!(file instanceof File) || typeof fieldKey !== "string" || typeof uploadSessionId !== "string") {
    return NextResponse.json({ error: "file, field_key, and upload_session_id are required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: intakeForm } = await supabase
    .from("digital_product_intake_forms")
    .select("id, workspace_id")
    .eq("public_token", params.token)
    .eq("status", "published")
    .maybeSingle();

  if (!intakeForm) {
    return NextResponse.json({ error: "This link is no longer available" }, { status: 404 });
  }

  const { data: field } = await supabase
    .from("digital_product_intake_fields")
    .select("field_type, file_config")
    .eq("form_id", intakeForm.id)
    .eq("field_key", fieldKey)
    .maybeSingle();

  if (!field || field.field_type !== "file_upload" || !field.file_config) {
    return NextResponse.json({ error: "Unknown upload field" }, { status: 400 });
  }

  const fileConfig = field.file_config as FileConfig;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await uploadDigitalProductIntakeFile(supabase, {
    workspaceId: intakeForm.workspace_id,
    formId: intakeForm.id,
    uploadSessionId,
    accept: fileConfig.accept,
    maxSizeBytes: fileConfig.max_size_bytes,
    bytes,
    declaredType: file.type,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ path: result.path });
}
