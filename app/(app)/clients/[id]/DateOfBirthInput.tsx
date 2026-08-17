"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DateField } from "@/components/DateField";
import { useToast } from "@/components/Toast";

export function DateOfBirthInput({ clientId, currentDate }: { clientId: string; currentDate: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [dob, setDob] = useState(currentDate);
  const [error, setError] = useState<string | null>(null);

  async function handleApply(next: string | null) {
    setError(null);
    const { error } = await supabase.from("clients").update({ date_of_birth: next }).eq("id", clientId);
    if (error) {
      setError(error.message);
      return;
    }
    setDob(next);
    toast.show("Date of birth saved", "success");
    router.refresh();
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted">Date of birth</p>
      <DateField value={dob} onApply={handleApply} className="mt-0.5" />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
