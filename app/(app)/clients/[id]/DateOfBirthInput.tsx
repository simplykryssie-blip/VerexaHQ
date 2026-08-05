"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DateOfBirthInput({ clientId, currentDate }: { clientId: string; currentDate: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const [dob, setDob] = useState(currentDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    setDob(next);
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("clients").update({ date_of_birth: next || null }).eq("id", clientId);
    setSaving(false);
    if (error) {
      setError(error.message);
      setDob(currentDate ?? "");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">Date of birth</p>
      <input
        type="date"
        value={dob}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-0.5 rounded-lg border border-border px-2 py-1 text-sm text-slate focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
