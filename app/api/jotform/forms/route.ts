import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type JotFormListItem = {
  id: string;
  title?: string;
  status?: string;
  count?: string;
  created_at?: string;
  updated_at?: string;
};

export async function GET() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: apiKey, error: keyError } = await supabase.rpc("get_workspace_jotform_api_key", { p_workspace_id: workspace.id });
  if (keyError || !apiKey) {
    return NextResponse.json({ ok: false, error: "Connect your JotForm API key first." }, { status: 400 });
  }

  let jotformResponse: { responseCode?: number; message?: string; content?: JotFormListItem[] };
  try {
    // limit=1000 -- JotForm's own ceiling per call; firms with more forms
    // than that are not the common case this list is built for.
    const res = await fetch(`https://api.jotform.com/user/forms?apiKey=${encodeURIComponent(apiKey)}&limit=1000&orderby=created`, {
      headers: { Accept: "application/json" },
    });
    jotformResponse = await res.json();
    if (!res.ok || jotformResponse.responseCode !== 200) {
      throw new Error(jotformResponse.message || `JotForm returned ${res.status}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach JotForm";
    return NextResponse.json({ ok: false, error: `Could not fetch your forms from JotForm: ${message}` }, { status: 502 });
  }

  const forms = (jotformResponse.content ?? [])
    .filter((f) => f.status !== "DELETED")
    .map((f) => ({
      id: f.id,
      title: f.title || "Untitled form",
      status: f.status || "ENABLED",
      submissionCount: Number(f.count ?? 0),
      updatedAt: f.updated_at || f.created_at || null,
    }))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

  return NextResponse.json({ ok: true, forms });
}
