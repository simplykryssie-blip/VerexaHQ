"use client";

import { useMemo, useState } from "react";
import { Plus, Zap, Power, PlayCircle, ListTree } from "lucide-react";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { WorkflowList, type WorkflowRow } from "@/components/workflows/WorkflowList";
import type { PipelineOption, TemplateOption } from "@/components/workflows/TriggerFields";
import type { LibraryFolderRow } from "@/components/library/types";

export function WorkflowsPageClient({
  workspaceId,
  workflows,
  folders,
  canManage,
  organizerTemplates,
  services,
  pipelines,
  tagOptions,
}: {
  workspaceId: string;
  workflows: WorkflowRow[];
  folders: LibraryFolderRow[];
  canManage: boolean;
  organizerTemplates: TemplateOption[];
  services: TemplateOption[];
  pipelines: PipelineOption[];
  tagOptions: string[];
}) {
  const [open, setOpen] = useState(false);

  const { enabledCount, totalRuns } = useMemo(
    () => ({
      enabledCount: workflows.filter((w) => w.is_enabled).length,
      totalRuns: workflows.reduce((sum, w) => sum + w.run_count, 0),
    }),
    [workflows]
  );

  return (
    <>
      <PageHero
        icon={Zap}
        tone="accent"
        heading={
          <>
            Your <HeroHighlight>workflows</HeroHighlight>.
          </>
        }
        subtitle="Automate what happens when something changes on an engagement -- send an email or text, create a task, after a status change."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setOpen((v) => !v)}>
              <Plus size={14} /> New workflow
            </Button>
          )
        }
      />
      <div className="flex-1 space-y-6 px-8 py-6">
        <div className="grid grid-cols-4 gap-4">
          <StatTile icon={Zap} tone="accent" label="Workflows" value={workflows.length} />
          <StatTile icon={Power} tone="emerald" label="Enabled" value={enabledCount} />
          <StatTile icon={PlayCircle} tone="violet" label="Total runs" value={totalRuns} />
          <StatTile icon={ListTree} tone="amber" label="Total steps" value={workflows.reduce((sum, w) => sum + w.step_count, 0)} />
        </div>
        <WorkflowList
          workspaceId={workspaceId}
          workflows={workflows}
          folders={folders}
          canManage={canManage}
          organizerTemplates={organizerTemplates}
          services={services}
          pipelines={pipelines}
          tagOptions={tagOptions}
          open={open}
          onOpenChange={setOpen}
        />
      </div>
    </>
  );
}
