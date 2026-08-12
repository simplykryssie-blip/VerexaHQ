"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensurePortalInvite } from "@/lib/portal/ensurePortalInvite";

// Any status that isn't one of these terminal client states counts as "still
// a lead" -- this makes the button work for any workspace-configured lead
// stage (see lead_stages table) without needing that list threaded in here.
const TERMINAL_STATUSES = ["active", "inactive", "archived"];

export function ConvertLeadButton({
  clientId,
  workspaceId,
  lifecycleStatus,
  name,
  email,
}: {
  clientId: string;
  lifecycleStatus: string;
  /** Optional -- when provided (with workspaceId), accepting also ensures a portal invite. */
  workspaceId?: string;
  name?: string;
  email?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [converting, setConverting] = useState(false);

  if (TERMINAL_STATUSES.includes(lifecycleStatus)) return null;

  async function convert() {
    setConverting(true);
    const { error } = await supabase.from("clients").update({ lifecycle_status: "active" }).eq("id", clientId);
    if (!error && workspaceId) {
      await ensurePortalInvite(supabase, { clientId, workspaceId, name: name ?? "", email: email ?? null });
    }
    setConverting(false);
    if (error) {
      window.alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={convert}
      disabled={converting}
      className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accentSoft disabled:opacity-60"
    >
      <UserCheck size={14} /> {converting ? "Converting..." : "Accept as Client"}
    </button>
  );
}
