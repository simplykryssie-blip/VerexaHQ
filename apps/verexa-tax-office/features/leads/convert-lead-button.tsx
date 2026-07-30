"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { Loader2, UserPlus } from "lucide-react";

export function ConvertLeadButton({ leadId, alreadyConverted }: { leadId: string; alreadyConverted: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleConvert() {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("convert_lead_to_client", { p_lead_id: leadId });
    setLoading(false);
    if (error || !data) {
      toast.error(friendlyDbError(error?.message));
      return;
    }
    toast.success("Lead converted to client");
    router.push(`/clients/${data}`);
    router.refresh();
  }

  if (alreadyConverted) return null;

  return (
    <Button variant="brand" size="sm" onClick={handleConvert} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      Convert to client
    </Button>
  );
}
