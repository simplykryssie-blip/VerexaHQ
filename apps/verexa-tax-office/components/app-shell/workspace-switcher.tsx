"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setSelectedWorkspaceAction } from "@/lib/auth/actions";
import { useWorkspace } from "@/components/providers/workspace-provider";

export function WorkspaceSwitcher() {
  const { workspace, memberships } = useWorkspace();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium px-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="truncate max-w-[160px]">{workspace.name}</span>
      </div>
    );
  }

  function choose(workspaceId: string) {
    startTransition(async () => {
      await setSelectedWorkspaceAction(workspaceId);
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="flex items-center gap-2 text-sm font-medium px-2 py-1.5 rounded-md hover:bg-accent disabled:opacity-60"
        >
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="truncate max-w-[160px]">{workspace.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem key={m.workspaceId} onClick={() => choose(m.workspaceId)} className="gap-2">
            {m.workspaceId === workspace.id ? (
              <Check className="h-4 w-4" />
            ) : (
              <span className="w-4" />
            )}
            <span className="truncate">{m.workspaceName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
