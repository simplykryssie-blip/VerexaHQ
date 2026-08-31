"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type PendingShare = {
  id: string;
  objectType: "organizer_templates" | "engagement_letter_templates";
  objectName: string;
  sharedByFirmName: string;
};

const OBJECT_TYPE_LABEL: Record<PendingShare["objectType"], string> = {
  organizer_templates: "organizer",
  engagement_letter_templates: "document",
};

export function PendingTemplateShares({ shares }: { shares: PendingShare[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  if (shares.length === 0) return null;

  async function respond(share: PendingShare, accept: boolean) {
    setRespondingId(share.id);
    const { error } = await supabase.rpc(accept ? "accept_config_object_share" : "decline_config_object_share", {
      p_share_id: share.id,
    });
    setRespondingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(accept ? `Copied "${share.objectName}" into your account.` : "Share declined.", "success");
    router.refresh();
  }

  return (
    <div className="mb-4 rounded-xl border border-accent/30 bg-accentSoft/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Share2 size={14} /> Templates shared with you
      </div>
      <div className="mt-3 space-y-2">
        {shares.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
            <p className="text-sm text-ink">
              <span className="font-medium">{s.sharedByFirmName}</span> shared the {OBJECT_TYPE_LABEL[s.objectType]}{" "}
              <span className="font-medium">&quot;{s.objectName}&quot;</span>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => respond(s, false)}
                disabled={respondingId === s.id}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-slate hover:bg-surfaceMuted disabled:opacity-60"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => respond(s, true)}
                disabled={respondingId === s.id}
                className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {respondingId === s.id ? "Copying..." : "Accept & copy to my account"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
