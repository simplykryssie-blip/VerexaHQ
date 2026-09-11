import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { slugify } from "@/lib/roleSlug";

export const dynamic = "force-dynamic";

// Same shape as app/api/jotform/import/route.ts -- see that file's own
// comment for the full explanation of why control_head/control_text/
// control_pagebreak are handled specially instead of skipped.
const SKIP_TYPES = new Set([
  "control_button",
  "control_divider",
  "control_captcha",
  "control_hidden",
  "control_collapse",
  "control_image",
]);

// Signature-type questions aren't rendered into the document body at all --
// Verexa's own engagement-letter signing (SignaturesPanel/requires_signature)
// is the real signing mechanism for a document template, so an inline
// "Signature: ____" line from the source form would just be a confusing
// second, non-functional signature line.
const SIGNATURE_TYPES = new Set(["control_signature"]);

type JotFormQuestion = {
  qid?: string;
  text?: string;
  type?: string;
  order?: string;
  subLabel?: string;
};

function extractFormId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/jotform\.com\/(?:form\/)?(\d+)/i) ?? trimmed.match(/(\d{6,})/);
  return match ? match[1] : null;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    return NextResponse.json({ ok: false, error: "That form has no content to import." }, { status: 400 });
  }

  let formName = `JotForm import ${formId}`;
  try {
    const propsRes = await fetch(`https://api.jotform.com/form/${formId}?apiKey=${encodeURIComponent(apiKey)}`);
    const propsJson = (await propsRes.json()) as { content?: { title?: string } };
    if (propsJson.content?.title) formName = propsJson.content.title;
  } catch {
    // Non-fatal -- keep the fallback name.
  }

  let requiresSignature = false;
  const placeholderFields: string[] = [];
  const htmlParts: string[] = [];

  for (const q of questions) {
    const type = q.type ?? "";
    const text = (q.text ?? "").trim();

    if (SIGNATURE_TYPES.has(type)) {
      requiresSignature = true;
      continue;
    }
    if (type === "control_head") {
      htmlParts.push(`<h3>${escapeHtml(text || "Untitled heading")}</h3>`);
      if (q.subLabel?.trim()) htmlParts.push(`<p>${escapeHtml(q.subLabel.trim())}</p>`);
      continue;
    }
    if (type === "control_text") {
      // Already HTML from JotForm's own rich-text "Text" element.
      htmlParts.push(text || "<p></p>");
      continue;
    }
    if (type === "control_pagebreak") {
      htmlParts.push(`<div data-page-break></div>`);
      continue;
    }
    // A real answerable field (name, date, checkbox, upload, etc.) has no
    // equivalent inside a flowing document -- left as a plain placeholder
    // line naming the question, called out in the import summary so staff
    // know to replace it with a real merge field or remove it.
    if (text) {
      placeholderFields.push(text);
      htmlParts.push(`<p>${escapeHtml(text)}: ____________________</p>`);
    }
  }

  const bodyHtml = htmlParts.join("\n") || "<p></p>";

  const base = slugify(formName);
  let slug = base;
  let template: { id: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("engagement_letter_templates")
      .insert({
        workspace_id: workspace.id,
        name: formName,
        slug,
        status: "draft",
        body_html: bodyHtml,
        requires_signature: requiresSignature,
      })
      .select("id")
      .single();
    if (!error && data) {
      template = data;
      break;
    }
    if (error?.code !== "23505") {
      return NextResponse.json({ ok: false, error: error?.message ?? "Could not create the document." }, { status: 500 });
    }
  }
  if (!template) {
    return NextResponse.json({ ok: false, error: "Could not create the document -- try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    templateId: template.id,
    templateName: formName,
    placeholderFields,
    requiresSignature,
  });
}
