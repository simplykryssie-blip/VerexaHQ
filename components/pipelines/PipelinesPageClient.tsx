"use client";

import { useMemo, useState } from "react";
import { Waypoints, Layers, CheckCircle2, PenLine } from "lucide-react";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
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

  const { publishedCount, draftCount, stageCount } = useMemo(
    () => ({
      publishedCount: pipelines.filter((p) => p.status === "published").length,
      draftCount: pipelines.filter((p) => p.status === "draft").length,
      stageCount: pipelines.reduce((sum, p) => sum + p.stage_count, 0),
    }),
    [pipelines]
  );

  return (
    <>
      <PageHero
        icon={Waypoints}
        tone="accent"
        heading={
          <>
            Your <HeroHighlight>pipelines</HeroHighlight>.
          </>
        }
        subtitle="The stages work moves through, with the right form, document checklist, or signable document attached where each one is needed."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              + New pipeline
            </Button>
          )
        }
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile icon={Waypoints} tone="accent" label="Pipelines" value={pipelines.length} />
          <StatTile icon={CheckCircle2} tone="emerald" label="Published" value={publishedCount} />
          <StatTile icon={PenLine} tone="amber" label="Draft" value={draftCount} />
          <StatTile icon={Layers} tone="violet" label="Total stages" value={stageCount} />
        </div>
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
