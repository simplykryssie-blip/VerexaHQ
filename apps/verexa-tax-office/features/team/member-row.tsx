"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { MEMBERSHIP_ROLE_LABELS, STAFF_ROLES, membershipStatusLabel } from "@/lib/validation/team";
import { initials } from "@/lib/formatters";
import type { Enums } from "@/types/database";

export function TeamMemberRow({
  memberId,
  name,
  email,
  role,
  status,
  title,
  canManage,
  isSelf,
}: {
  memberId: string;
  name: string;
  email: string | null;
  role: Enums<"membership_role">;
  status: Enums<"membership_status">;
  title: string | null;
  canManage: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function updateRole(next: Enums<"membership_role">) {
    setBusy(true);
    const { error } = await supabase.from("workspace_members").update({ role: next }).eq("id", memberId);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Role updated");
    router.refresh();
  }

  async function toggleStatus() {
    const next = status === "suspended" ? "active" : "suspended";
    setBusy(true);
    const { error } = await supabase.from("workspace_members").update({ status: next }).eq("id", memberId);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success(next === "suspended" ? "Member suspended" : "Member reactivated");
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    setBusy(true);
    const { error } = await supabase.from("workspace_members").update({ status: "removed", ended_at: new Date().toISOString() }).eq("id", memberId);
    setBusy(false);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Member removed");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-3 p-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">{initials(name)}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate">{title || email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={status === "active" ? "success" : status === "suspended" || status === "removed" ? "destructive" : "secondary"}>{membershipStatusLabel(status)}</Badge>
        {canManage && !isSelf && role !== "owner" ? (
          <Select value={role} onValueChange={(v) => updateRole(v as Enums<"membership_role">)} disabled={busy}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAFF_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {MEMBERSHIP_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline">{MEMBERSHIP_ROLE_LABELS[role]}</Badge>
        )}
        {canManage && !isSelf && role !== "owner" && status !== "removed" && (
          <>
            <Button size="sm" variant="ghost" disabled={busy} onClick={toggleStatus}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {status === "suspended" ? "Reactivate" : "Suspend"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
              Remove
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
