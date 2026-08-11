import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { slugify } from "@/lib/roleSlug";

export const dynamic = "force-dynamic";

// JotForm's public API returns questions keyed by qid, not as an array:
// { responseCode, message, content: { "3": {...}, "5": {...} } }.
// Structural elements (headers, dividers, page breaks, submit buttons,
// captcha) are not real answerable fields and are skipped entirely.
const SKIP_TYPES = new Set([
  "control_head",
  "control_button",
  "control_divider",
  "control_pagebreak",
  "control_captcha",
  "control_hidden",
  "control_collapse",
  "control_image",
  "control_text",
]);

// Maps a JotForm question type to one of the field types our organizer
// builder actually supports. Anything not listed here falls back to
// short_text and is called out in the import summary as approximated,
// rather than silently guessed.
const TYPE_MAP: Record<string, string> = {
  control_textbox: "short_text",
  control_email: "short_text",
  control_phone: "short_text",
  control_number: "number",
  control_textarea: "paragraph",
  control_dropdown: "dropdown",
  control_radio: "radio_button",
  control_checkbox: "checkbox",
  control_datetime: "date",
  control_address: "address",
  control_fileupload: "file_upload",
  control_signature: "signature",
  control_fullname: "short_text",
};

type JotFormQuestion = {
  qid?: string;
  text?: string;
  type?: string;
  order?: string;
  required?: string;
  options?: string;
};

function extractFormId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/jotform\.com\/(?:form\/)?(\d+)/i) ?? trimmed.match(/(\d{6,})/);
  return match ? match[1] : null;
}

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const { formIdOrUrl } = (await request.json()) as { formIdOrUrl?: string };
  if (!formIdOrUrl) {
    return NextResponse.json({ ok: false, error: "Paste a JotForm form link or ID." }, { status: 400 });
  }

  const formId = extractFormId(formIdOrUrl);
  if (!formId) {
    return NextResponse.json({ ok: false, error: "Couldn't find a form ID in that link -- paste the full JotForm URL or just the numeric form ID." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: apiKey, error: keyError } = await supabase.rpc("get_workspace_jotform_api_key", { p_workspace_id: workspace.id });
  if (keyError || !apiKey) {
    return NextResponse.json({ ok: false, error: "Connect your JotForm API key first." }, { status: 400 });
  }

  let jotformResponse: { responseCode?: number; message?: string; content?: Record<string, JotFormQuestion> };
  try {
    const res = await fetch(`https://api.jotform.com/form/${formId}/questions?apiKey=${encodeURIComponent(apiKey)}`, {
      headers: { Accept: "application/json" },
    });
    jotformResponse = await res.json();
    if (!res.ok || jotformResponse.responseCode !== 200) {
      throw new Error(jotformResponse.message || `JotForm returned ${res.status}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach JotForm";
    return NextResponse.json({ ok: false, error: `Could not fetch that form from JotForm: ${message}` }, { status: 502 });
  }

  const questions = Object.values(jotformResponse.content ?? {})
    .filter((q) => q.type && !SKIP_TYPES.has(q.type))
    .sort((a, b) => parseInt(a.order ?? "0", 10) - parseInt(b.order ?? "0", 10));

  if (questions.length === 0) {
    return NextResponse.json({ ok: false, error: "That form has no importable fields." }, { status: 400 });
  }

  let formName = `JotForm import ${formId}`;
  try {
    const propsRes = await fetch(`https://api.jotform.com/form/${formId}?apiKey=${encodeURIComponent(apiKey)}`);
    const propsJson = (await propsRes.json()) as { content?: { title?: string } };
    if (propsJson.content?.title) formName = propsJson.content.title;
  } catch {
    // Non-fatal -- keep the fallback name.
  }

  const base = slugify(formName);
  let slug = base;
  let template: { id: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("organizer_templates")
      .insert({ workspace_id: workspace.id, name: formName, slug, status: "draft", description: `Imported from JotForm form ${formId}.` })
      .select("id")
      .single();
    if (!error && data) {
      template = data;
      break;
    }
    if (error?.code !== "23505") {
      return NextResponse.json({ ok: false, error: error?.message ?? "Could not create the organizer template." }, { status: 500 });
    }
  }
  if (!template) {
    return NextResponse.json({ ok: false, error: "Could not create the organizer template -- try again." }, { status: 500 });
  }

  const approximated: string[] = [];
  const fieldsToInsert = questions.map((q, index) => {
    const mapped = TYPE_MAP[q.type ?? ""];
    if (!mapped) approximated.push(q.text || q.type || "untitled field");
    const options = q.options
      ? q.options
          .split("|")
          .map((o) => o.trim())
          .filter(Boolean)
      : [];
    return {
      organizer_template_id: template!.id,
      field_type: mapped ?? "short_text",
      label: q.text || "Untitled field",
      display_order: index,
      is_required: q.required === "Yes",
      options,
    };
  });

  const { error: fieldsError } = await supabase.from("organizer_fields").insert(fieldsToInsert as never);
  if (fieldsError) {
    return NextResponse.json({ ok: false, error: fieldsError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    templateId: template.id,
    templateName: formName,
    fieldCount: fieldsToInsert.length,
    approximatedFields: approximated,
  });
}
