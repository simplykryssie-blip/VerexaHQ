"use client";

import { useState } from "react";
import { ServiceDetailsTab, type ServiceDetailsRow } from "@/components/settings/ServiceDetailsTab";
import { ServiceBoard, type StageColumn, type BoardCard } from "@/components/pipelines/ServiceBoard";

type Option = { id: string; name: string };

const TABS = [
  { key: "details", label: "Details" },
  { key: "board", label: "Board" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function ServiceDetailTabs({
  service,
  workspaceId,
  categories,
  organizerTemplates,
  hasPipeline,
  boardStages,
  boardCards,
  defaultTab,
}: {
  service: ServiceDetailsRow;
  workspaceId: string;
  categories: Option[];
  organizerTemplates: Option[];
  hasPipeline: boolean;
  boardStages: StageColumn[];
  boardCards: BoardCard[];
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
            organizerTemplates={organizerTemplates}
            hasPipeline={hasPipeline}
          />
        )}

        {tab === "board" && (
          <div>
            <p className="mb-4 text-sm text-muted">
              Every active engagement using this service, grouped by which stage it&apos;s currently sitting in. This is a live view --
              nothing here is configured, it just reflects what&apos;s already happening. Build or change the stages themselves under
              Pipelines.
            </p>
            <ServiceBoard stages={boardStages} cards={boardCards} />
          </div>
        )}
      </div>
    </div>
  );
}
