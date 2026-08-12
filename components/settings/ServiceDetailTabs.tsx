"use client";

import { useState } from "react";
import { ServiceDetailsTab, type ServiceDetailsRow } from "@/components/settings/ServiceDetailsTab";
import { StageEditor } from "@/components/settings/StageEditor";
import { FolderTemplateEditor } from "@/components/settings/FolderTemplateEditor";
import { ServiceBoard, type StageColumn, type BoardCard } from "@/components/pipelines/ServiceBoard";

type Option = { id: string; name: string };
type PricingRuleOption = { id: string; name: string; pricing_method: string };
type ProcessOption = { id: string; name: string; workspace_id: string | null } | null;
type ProcessStage = {
  id: string;
  process_id: string;
  name: string;
  display_order: number;
  organizer_template_id?: string | null;
  document_request_template_id?: string | null;
  engagement_letter_template_id?: string | null;
};
type ProcessTask = { id: string; process_stage_id: string; name: string; description: string | null; display_order: number; is_required: boolean };

const TABS = [
  { key: "details", label: "Details" },
  { key: "stages", label: "Stages" },
  { key: "board", label: "Board" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function ServiceDetailTabs({
  service,
  workspaceId,
  isSystemDefault,
  canEdit,
  categories,
  pricingRules,
  billingRules,
  organizerTemplates,
  documentRequestTemplates,
  engagementLetterTemplates,
  documentFolderTemplates,
  process,
  stages,
  tasks,
  engagementCountsByStage,
  boardStages,
  boardCards,
  folderTemplateId,
  folderTemplateName,
  folderTemplateIsSystemDefault,
  canEditFolders,
  folderItems,
  defaultTab,
}: {
  service: ServiceDetailsRow;
  workspaceId: string;
  isSystemDefault: boolean;
  canEdit: boolean;
  categories: Option[];
  pricingRules: PricingRuleOption[];
  billingRules: Option[];
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  engagementLetterTemplates: Option[];
  documentFolderTemplates: Option[];
  process: ProcessOption;
  stages: ProcessStage[];
  tasks: ProcessTask[];
  engagementCountsByStage: Record<string, number>;
  boardStages: StageColumn[];
  boardCards: BoardCard[];
  folderTemplateId: string | null;
  folderTemplateName: string | null;
  folderTemplateIsSystemDefault: boolean;
  canEditFolders: boolean;
  folderItems: { id: string; parent_item_id: string | null; name: string; display_order: number }[];
  defaultTab?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(defaultTab ?? "details");

  return (
    <div>
      <nav className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "details" && (
          <ServiceDetailsTab
            service={service}
            workspaceId={workspaceId}
            categories={categories}
            pricingRules={pricingRules}
            billingRules={billingRules}
            organizerTemplates={organizerTemplates}
            documentFolderTemplates={documentFolderTemplates}
          />
        )}

        {tab === "stages" && (
          <div className="max-w-3xl">
            <p className="text-sm text-muted">
              The ordered steps this service&apos;s engagements move through, with the right form or letter attached at the stage that
              needs it. Changes here are global -- they apply to every engagement using this service, not just one client&apos;s.
            </p>
            <div className="mt-6">
              <StageEditor
                serviceId={service.id}
                isSystemDefault={isSystemDefault}
                canEdit={canEdit}
                process={process}
                stages={stages}
                tasks={tasks}
                engagementCountsByStage={engagementCountsByStage}
                organizerTemplates={organizerTemplates}
                documentRequestTemplates={documentRequestTemplates}
                engagementLetterTemplates={engagementLetterTemplates}
              />
            </div>

            <div className="mt-8">
              <h3 className="text-sm font-semibold text-ink">Document folders</h3>
              <p className="mt-1 text-sm text-muted">
                The folder structure auto-created in every new engagement using this service. Renaming or deleting a folder here only
                affects future engagements -- it never touches folders already created for existing ones.
              </p>
              <div className="mt-3">
                <FolderTemplateEditor
                  serviceId={service.id}
                  workspaceId={workspaceId}
                  templateId={folderTemplateId}
                  templateName={folderTemplateName}
                  isSystemDefault={folderTemplateIsSystemDefault}
                  canEdit={canEditFolders}
                  items={folderItems}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "board" && (
          <div>
            <p className="mb-4 text-sm text-muted">
              Every active engagement using this service, grouped by which stage it&apos;s currently sitting in. This is a live view --
              nothing here is configured, it just reflects what&apos;s already happening. Build or change the stages themselves under the
              Stages tab.
            </p>
            <ServiceBoard stages={boardStages} cards={boardCards} />
          </div>
        )}
      </div>
    </div>
  );
}
