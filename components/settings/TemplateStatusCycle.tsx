"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

const NEXT_STATUS: Record<string, string> = { draft: "published", published: "archived", archived: "draft" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-surfaceMuted text-muted",
  published: "bg-success/10 text-success",
  archived: "bg-surfaceMuted text-muted",
};

export function TemplateStatusCycle({
  table,
  id,
  status,
}: {
  table:
    | "email_templates"
    | "sms_templates"
    | "engagement_letter_templates"
    | "services"
    | "pricing_rules"
    | "billing_rules"
    | "organizer_templates"
    | "processes"
    | "site_pages"
    | "site_funnels"
    | "site_websites";
  id: string;
  status: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  async function cycle() {
    setSaving(true);
    const { error } = await supabase.from(table).update({ status: NEXT_STATUS[status] ?? "draft" }).eq("id", id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={saving}
      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition hover:opacity-80 disabled:opacity-60 ${STATUS_STYLE[status] ?? "bg-surfaceMuted text-muted"}`}
    >
      {status}
    </button>
  );
}
