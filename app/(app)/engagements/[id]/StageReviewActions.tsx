"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function StageReviewActions({ stageId }: { stageId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setPending(true);
    setError(null);
    const { error } = await supabase
      .from("workflow_stages")
      .update({ status: "Completed", completed_at: new Date().toISOString() })
      .eq("id", stageId);
    setPending(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={approve}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
      >
        {pending ? "Saving..." : "Approve"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
