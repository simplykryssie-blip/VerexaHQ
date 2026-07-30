"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogoMark } from "@/components/logo";
import { setSelectedWorkspaceAction } from "@/lib/auth/actions";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import type { WorkspaceMembership } from "@/lib/auth/workspace";
import { Loader2 } from "lucide-react";

export function WorkspaceChooserList({ memberships }: { memberships: WorkspaceMembership[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectingId, setSelectingId] = useState<string | null>(null);

  function choose(workspaceId: string) {
    setSelectingId(workspaceId);
    startTransition(async () => {
      await setSelectedWorkspaceAction(workspaceId);
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {memberships.map((m) => (
        <button
          key={m.workspace.id}
          type="button"
          disabled={pending}
          onClick={() => choose(m.workspace.id)}
          className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
        >
          <LogoMark size={32} />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{m.workspace.name}</div>
            <Badge variant="secondary" className="mt-1">
              {ROLE_LABELS[m.role]}
            </Badge>
          </div>
          {pending && selectingId === m.workspace.id ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Button variant="ghost" size="sm" tabIndex={-1} aria-hidden>
              Select
            </Button>
          )}
        </button>
      ))}
    </div>
  );
}
