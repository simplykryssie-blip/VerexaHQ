"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function ConvertLeadButton({ clientId, lifecycleStatus }: { clientId: string; lifecycleStatus: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [converting, setConverting] = useState(false);

  if (lifecycleStatus !== "lead") return null;

  async function convert() {
    setConverting(true);
    const { error } = await supabase.from("clients").update({ lifecycle_status: "active" }).eq("id", clientId);
    setConverting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Converted to client", "success");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={convert}
      disabled={converting}
      className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accentSoft disabled:opacity-60"
    >
      <UserCheck size={14} /> {converting ? "Converting..." : "Accept as Client"}
    </button>
  );
}
