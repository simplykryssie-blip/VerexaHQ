"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LABELS = { ssn: "SSN", ein: "EIN", itin: "ITIN" } as const;

export function TaxIdReveal({ clientId, kind, last4 }: { clientId: string; kind: "ssn" | "ein" | "itin"; last4: string | null }) {
  const supabase = createClient();
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!last4) return null;

  async function reveal() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc(`reveal_client_${kind}`, { p_client_id: clientId });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setValue(data);
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">{LABELS[kind]}</p>
      <div className="mt-0.5 flex items-center gap-2">
        <p className="font-mono text-slate">{value ?? `••• •• ${last4}`}</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => (value ? setValue(null) : reveal())}
          className="text-xs font-medium text-accent hover:underline disabled:opacity-60"
        >
          {loading ? "Revealing..." : value ? "Hide" : "Reveal"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
