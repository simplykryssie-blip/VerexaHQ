"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Workflow, ShieldCheck, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/Badge";
import { IconChip } from "@/components/ui/IconChip";
import { EmptyState } from "@/components/EmptyState";

export type MarketplaceTemplateRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  source_table: "organizer_templates" | "automations";
  version: number;
  is_installed: boolean;
  installation_id: string | null;
  update_available: boolean;
};

const TYPE_LABEL: Record<MarketplaceTemplateRow["source_table"], string> = {
  organizer_templates: "Organizer",
  automations: "Workflow",
};

// Every row in this catalog is Verexa-owned in Phase 6A (there is no
// community/creator marketplace yet), so the "Verexa Verified" indicator is
// unconditional rather than a per-row flag.
function TemplateCard({ template, workspaceId }: { template: MarketplaceTemplateRow; workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [installing, setInstalling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const Icon = template.source_table === "organizer_templates" ? ClipboardList : Workflow;

  async function install() {
    setInstalling(true);
    const { error } = await supabase.rpc("install_marketplace_template", {
      p_workspace_id: workspaceId,
      p_marketplace_template_id: template.id,
    });
    setInstalling(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(`${template.name} installed`, "success");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconChip tone="violet">
            <Icon size={16} aria-hidden="true" />
          </IconChip>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{template.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">{TYPE_LABEL[template.source_table]}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full bg-accentSoft px-2.5 py-0.5 text-xs font-medium text-accent">
                <ShieldCheck size={11} aria-hidden="true" /> Verexa Verified
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-left text-xs text-muted hover:text-ink"
      >
        <ChevronDown size={12} className={`transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        View details
      </button>
      {expanded && template.description && <p className="text-xs text-muted">{template.description}</p>}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {template.is_installed ? (
          <div className="flex items-center gap-2">
            <Badge tone="success">Installed</Badge>
            {template.update_available && <Badge tone="warning">Update available</Badge>}
          </div>
        ) : (
          <span className="text-xs text-muted">Not installed</span>
        )}
        <button
          type="button"
          onClick={install}
          disabled={installing}
          className="rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accentSoft disabled:opacity-50"
        >
          {installing ? "Installing..." : template.is_installed ? "Reinstall" : "Install"}
        </button>
      </div>
    </div>
  );
}

export function MarketplaceGrid({ workspaceId, templates }: { workspaceId: string; templates: MarketplaceTemplateRow[] }) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set(templates.map((t) => t.category));
    return ["all", ...Array.from(set)];
  }, [templates]);

  const filtered = activeCategory === "all" ? templates : templates.filter((t) => t.category === activeCategory);

  if (templates.length === 0) {
    return <EmptyState icon={ClipboardList} message="No templates are available for your workspace type yet." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCategory(c)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              activeCategory === c ? "bg-accentSoft text-accent" : "text-muted hover:text-ink"
            }`}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <TemplateCard key={t.id} template={t} workspaceId={workspaceId} />
        ))}
      </div>
    </div>
  );
}
