"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Workflow } from "lucide-react";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { ServiceEditRow } from "@/components/settings/ServiceEditRow";
import { CreateServiceForm } from "@/components/settings/CreateServiceForm";
import { CloneServiceButton } from "@/components/settings/CloneServiceButton";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";

type Option = { id: string; name: string };

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
  document_request_template_id: string | null;
  document_folder_template_id: string | null;
  engagement_letter_template_id: string | null;
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
  billingRules,
  organizerTemplates,
  documentRequestTemplates,
  documentFolderTemplates,
  engagementLetterTemplates,
}: {
  workspaceId: string;
  services: ServiceCard[];
  categories: Option[];
  pricingRules: Option[];
  billingRules: Option[];
  organizerTemplates: Option[];
  documentRequestTemplates: Option[];
  documentFolderTemplates: Option[];
  engagementLetterTemplates: Option[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(
    () => services.filter((s) => (!query || s.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || s.status === status)),
    [services, query, status]
  );

  const editing = services.find((s) => s.id === editingId) ?? null;
  const editorProps = { categories, pricingRules, billingRules, organizerTemplates, documentRequestTemplates, documentFolderTemplates, engagementLetterTemplates };

  return (
    <div>
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
              return (
                <div key={s.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:shadow-md">
                  <div className="relative flex h-20 items-center justify-center bg-gradient-to-br from-accent to-accent/70">
                    <Workflow size={30} className="text-white/90" aria-hidden="true" />
                    <div className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditingId(s.id)}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-white/90"
                      >
                        {isSystem ? "View" : "Edit"}
                      </button>
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
                      {price && <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">{price}</span>}
                      {s.is_bookable && (
                        <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">
                          Bookable{s.estimated_duration_minutes ? ` -- ${s.estimated_duration_minutes} min` : ""}
                        </span>
                      )}
                      {s.is_portal_visible && <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">Portal visible</span>}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(s.id)}
                        className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
                      >
                        {isSystem ? "View" : "Edit"}
                      </button>
                    </div>
                    <div className="mt-2">
                      {isSystem ? (
                        <CloneServiceButton serviceId={s.id} workspaceId={workspaceId} />
                      ) : (
                        <Link href={`/service-packages/${s.id}`} className="text-xs font-medium text-accent hover:underline">
                          Manage stages
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && <ServiceEditRow service={editing} onClose={() => setEditingId(null)} {...editorProps} />}

      {creating && (
        <Modal title="New service package" onClose={() => setCreating(false)} size="xl">
          <CreateServiceForm workspaceId={workspaceId} defaultOpen onSuccess={() => setCreating(false)} {...editorProps} />
        </Modal>
      )}
    </div>
  );
}
