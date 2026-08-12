"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Search, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { CreateServiceForm } from "@/components/settings/CreateServiceForm";
import { CloneServiceButton } from "@/components/settings/CloneServiceButton";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";

type Option = { id: string; name: string };
type PricingRuleOption = { id: string; name: string; pricing_method: string };

export type ServiceCard = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  default_price: number | null;
  description: string | null;
  estimated_duration_minutes: number | null;
  is_bookable: boolean;
  is_portal_visible: boolean;
  categoryName: string | null;
  service_category_id: string | null;
  pricing_rule_id: string | null;
  billing_rule_id: string | null;
  organizer_template_id: string | null;
  document_folder_template_id: string | null;
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function money(n: number | null) {
  if (n === null) return null;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ServiceGallery({
  workspaceId,
  services,
  categories,
  pricingRules,
}: {
  workspaceId: string;
  services: ServiceCard[];
  categories: Option[];
  pricingRules: PricingRuleOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [cloningAll, setCloningAll] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const filtered = useMemo(
    () => services.filter((s) => (!query || s.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || s.status === status)),
    [services, query, status]
  );

  const hasNoOwnedServices = services.length > 0 && services.every((s) => !s.workspace_id);

  async function duplicateService(id: string, name: string) {
    setDuplicatingId(id);
    await supabase.rpc("duplicate_config_object", { p_table: "services", p_id: id, p_target_workspace_id: workspaceId, p_new_name: `${name} (copy)` });
    setDuplicatingId(null);
    router.refresh();
  }

  async function cloneAllStarters() {
    setCloningAll(true);
    for (const s of services.filter((s) => !s.workspace_id)) {
      await supabase.rpc("duplicate_config_object", { p_table: "services", p_id: s.id, p_target_workspace_id: workspaceId });
    }
    setCloningAll(false);
    router.refresh();
  }

  return (
    <div>
      {hasNoOwnedServices && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accentSoft px-4 py-3">
          <p className="text-sm text-accent">
            Every service package below is one of Verexa&apos;s starter templates, shared across every workspace -- that&apos;s why they only show
            &quot;View.&quot; Clone one to get your own editable copy with your own pricing, checklist stages, and documents.
          </p>
          <button
            type="button"
            onClick={cloneAllStarters}
            disabled={cloningAll}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {cloningAll ? "Cloning..." : "Clone all to get started"}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search service packages..."
            className="w-72 rounded-lg border border-border py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                status === f.value ? "bg-accentSoft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {services.length > 0 && filtered.length === 0 ? (
          <EmptyState icon={Search} message="No service packages match." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted transition hover:border-accent hover:text-accent"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surfaceMuted">
                <Plus size={20} />
              </span>
              <span className="text-sm font-medium">Create new service package</span>
            </button>

            {filtered.map((s) => {
              const isSystem = !s.workspace_id;
              const price = money(s.default_price);
              const pricingRule = pricingRules.find((r) => r.id === s.pricing_rule_id);
              const isVariablePricing = Boolean(pricingRule && ["custom_quote", "tax_form_based", "complexity_based"].includes(pricingRule.pricing_method));
              return (
                <div key={s.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:shadow-md">
                  <div className="relative flex h-20 items-center justify-center bg-gradient-to-br from-accent to-accent/70">
                    <Workflow size={30} className="text-white/90" aria-hidden="true" />
                    <div className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition group-hover:opacity-100">
                      <Link
                        href={`/service-packages/${s.id}`}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white/90"
                      >
                        {isSystem ? "View" : "Open"}
                      </Link>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{s.name}</h3>
                      {isSystem && <span className="shrink-0 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted">{s.categoryName ?? "Uncategorized"}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {isSystem ? (
                        <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium capitalize text-muted">{s.status}</span>
                      ) : (
                        <TemplateStatusCycle table="services" id={s.id} status={s.status} />
                      )}
                      {isVariablePricing ? (
                        <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">Custom quote</span>
                      ) : (
                        price && <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">{price}</span>
                      )}
                      {s.is_bookable && (
                        <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">
                          Bookable{s.estimated_duration_minutes ? ` -- ${s.estimated_duration_minutes} min` : ""}
                        </span>
                      )}
                      {s.is_portal_visible && <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">Portal visible</span>}
                    </div>

                    {isSystem ? (
                      <>
                        <div className="mt-3">
                          <CloneServiceButton serviceId={s.id} workspaceId={workspaceId} />
                        </div>
                        <Link href={`/service-packages/${s.id}`} className="mt-2 text-xs font-medium text-muted hover:text-ink">
                          View starter template
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/service-packages/${s.id}`}
                          className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent/90"
                        >
                          <Workflow size={13} /> Manage service
                        </Link>
                        <button
                          type="button"
                          onClick={() => duplicateService(s.id, s.name)}
                          disabled={duplicatingId === s.id}
                          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent disabled:opacity-60"
                        >
                          <Copy size={13} /> Duplicate
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <Modal title="New service package" onClose={() => setCreating(false)} size="xl">
          <CreateServiceForm
            workspaceId={workspaceId}
            categories={categories}
            defaultOpen
            onSuccess={(id) => router.push(`/service-packages/${id}`)}
          />
        </Modal>
      )}
    </div>
  );
}
