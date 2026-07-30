import { z } from "zod";
import type { Enums } from "@/types/database";

type ComplianceCaseType = Enums<"compliance_case_type">;
type ComplianceCaseStatus = Enums<"compliance_case_status">;
type RiskLevel = Enums<"risk_level">;

// Verbatim from generated database enums — never invent values here.
export const COMPLIANCE_CASE_TYPE_LABELS: Record<ComplianceCaseType, string> = {
  due_diligence: "Due diligence",
  identity_verification: "Identity verification",
  fraud_risk: "Fraud risk",
  credit_eligibility: "Credit eligibility",
  filing_status: "Filing status",
  dependent_eligibility: "Dependent eligibility",
  income_verification: "Income verification",
  document_sufficiency: "Document sufficiency",
  quality_review: "Quality review",
  other: "Other",
};

export const COMPLIANCE_CASE_STATUS_LABELS: Record<ComplianceCaseStatus, string> = {
  open: "Open",
  in_review: "In review",
  waiting_on_client: "Waiting on client",
  waiting_on_staff: "Waiting on staff",
  resolved: "Resolved",
  not_applicable: "Not applicable",
  escalated: "Escalated",
  closed: "Closed",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export const COMPLIANCE_CASE_TYPES = Object.keys(COMPLIANCE_CASE_TYPE_LABELS) as [ComplianceCaseType, ...ComplianceCaseType[]];
export const RISK_LEVELS = Object.keys(RISK_LEVEL_LABELS) as [RiskLevel, ...RiskLevel[]];

export function caseTypeLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (COMPLIANCE_CASE_TYPE_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function caseStatusLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (COMPLIANCE_CASE_STATUS_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}
export function riskLevelLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return (RISK_LEVEL_LABELS as Record<string, string>)[v] ?? v.replace(/_/g, " ");
}

export const complianceCaseSchema = z.object({
  title: z.string().trim().min(1, "Enter a title."),
  description: z.string().max(2000).optional().nullable(),
  caseType: z.enum(COMPLIANCE_CASE_TYPES),
  riskLevel: z.enum(RISK_LEVELS).default("low"),
  assignedToUserId: z.string().uuid().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  clientId: z.string().uuid("Choose a client."),
  engagementId: z.string().uuid().optional().nullable(),
});
export type ComplianceCaseInput = z.infer<typeof complianceCaseSchema>;

export const resolveCaseSchema = z.object({
  resolutionSummary: z.string().trim().min(1, "Enter a resolution summary.").max(2000),
});
export type ResolveCaseInput = z.infer<typeof resolveCaseSchema>;

export const resolveFlagSchema = z.object({
  resolutionNotes: z.string().trim().min(1, "Enter resolution notes.").max(2000),
});
export type ResolveFlagInput = z.infer<typeof resolveFlagSchema>;

export const checklistItemResultSchema = z.object({
  result: z.enum(["pending", "pass", "fail", "needs_clarification", "not_applicable"]),
  notes: z.string().max(2000).optional().nullable(),
});
export type ChecklistItemResultInput = z.infer<typeof checklistItemResultSchema>;
