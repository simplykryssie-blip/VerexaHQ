"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { PipelineLibrary, type PipelineCard } from "@/components/pipelines/PipelineLibrary";
import type { LibraryFolderRow } from "@/components/library/types";

export function PipelinesPageClient({
  workspaceId,
  pipelines,
  folders,
  canManage,
}: {
  workspaceId: string;
  pipelines: PipelineCard[];
  folders: LibraryFolderRow[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Pipelines"
        description="The stages work moves through, with the right form, document checklist, or signable document attached where each one is needed."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              + New pipeline
            </Button>
          )
        }
      />
      <div className="flex-1 px-8 py-6">
        <PipelineLibrary
          workspaceId={workspaceId}
          pipelines={pipelines}
          folders={folders}
          canManage={canManage}
          creating={creating}
          onCreatingChange={setCreating}
        />
      </div>
    </>
  );
}
