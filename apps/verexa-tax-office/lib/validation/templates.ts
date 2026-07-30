import type { Enums } from "@/types/database";

type TemplateKind = Enums<"template_kind">;
type TemplateStatus = Enums<"template_status">;
type TemplateVisibility = Enums<"template_visibility">;

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  form: "Form / Organizer",
  workflow: "Workflow",
  message: "Message (email/SMS/portal)",
  document_request: "Document request",
  checklist: "Checklist",
  engagement: "Engagement",
  service_package: "Service package",
  sop: "SOP",
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const TEMPLATE_VISIBILITY_LABELS: Record<TemplateVisibility, string> = {
  private: "Private",
  workspace: "Workspace",
  connected_users: "Connected users",
  connected_offices: "Connected offices",
  organization_network: "Organization network",
  marketplace: "Marketplace",
};

export const TEMPLATE_KINDS = Object.keys(TEMPLATE_KIND_LABELS) as [TemplateKind, ...TemplateKind[]];
export const TEMPLATE_VISIBILITIES = Object.keys(TEMPLATE_VISIBILITY_LABELS) as [TemplateVisibility, ...TemplateVisibility[]];

export function templateKindLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (TEMPLATE_KIND_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function templateStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (TEMPLATE_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function templateVisibilityLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (TEMPLATE_VISIBILITY_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
