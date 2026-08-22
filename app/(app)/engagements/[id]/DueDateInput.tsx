"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DateField } from "@/components/DateField";
import { useToast } from "@/components/Toast";

export function DueDateInput({ engagementId, currentDueDate }: { engagementId: string; currentDueDate: string | null }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [dueDate, setDueDate] = useState(currentDueDate);
  const [error, setError] = useState<string | null>(null);

  async function handleApply(next: string | null) {
    setError(null);
    const { error } = await supabase.from("engagements").update({ due_date: next }).eq("id", engagementId);
    if (error) {
      setError(error.message);
      return;
    }
    setDueDate(next);
    toast.show("Due date saved", "success");
    router.refresh();
  }

  return (
    <div>
      <DateField value={dueDate} onApply={handleApply} />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
