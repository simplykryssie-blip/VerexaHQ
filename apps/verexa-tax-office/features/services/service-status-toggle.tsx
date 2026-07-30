"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";

export function ServiceStatusToggle({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, setBusy] = useState(false);

  function toggle() {
    const next = status === "active" ? "inactive" : "active";
    setBusy(true);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("services").update({ status: next }).eq("id", id);
      setBusy(false);
      if (error) {
        toast.error(friendlyDbError(error.message));
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
      {status === "active" ? "Deactivate" : "Activate"}
    </Button>
  );
}
