"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Mirrors clients/[id]/TaxIdReveal.tsx -- same reveal/hide UX, same
// permission-gated, audit-logged RPC pattern. The masked value (last 4
// only) is all that's ever sent to the browser; the real value is fetched
// on demand and only ever held in this component's own state.
export function OrganizerAnswerReveal({ answerId, masked }: { answerId: string; masked: string }) {
  const supabase = createClient();
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("reveal_organizer_answer", { p_answer_id: answerId });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setValue(data);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{value ?? masked}</span>
      <button
        type="button"
        disabled={loading}
        onClick={() => (value ? setValue(null) : reveal())}
        className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
      >
        {loading ? "Revealing..." : value ? "Hide" : "Reveal"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
