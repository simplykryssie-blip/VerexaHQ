"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { Loader2, X } from "lucide-react";

// Removes a household_members row only — never touches the linked
// clients record, so an unrelated client can't be deleted by accident.
export function RemoveMemberButton({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("household_members").delete().eq("id", memberId);
    setLoading(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Member removed");
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Remove?</span>
        <Button size="sm" variant="destructive" onClick={remove} disabled={loading}>
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button size="icon" variant="ghost" onClick={() => setConfirming(true)} aria-label="Remove member">
      <X className="h-4 w-4" />
    </Button>
  );
}
