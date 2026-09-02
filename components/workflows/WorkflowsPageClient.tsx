"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
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

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Automate what happens when something changes on an engagement -- send an email or text, create a task, after a status change."
        actions={
          canManage && (
            <Button size="sm" onClick={() => setOpen((v) => !v)}>
              <Plus size={14} /> New workflow
            </Button>
          )
        }
      />
      <div className="flex-1 px-8 py-6">
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
