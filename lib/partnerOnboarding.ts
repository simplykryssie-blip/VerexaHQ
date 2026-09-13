// Pure, presentation-only helpers shared by the Firms list, Firm Detail's
// Onboarding section, and the partner-side dashboard block. Phase 6B's
// partner_onboardings record is the only state that exists -- there is no
// separate "waiting on" or "checklist" table. Everything here is derived
// from the columns list_partner_onboardings/get_my_partner_onboarding
// already return, never stored.
//
// Deliberately NOT in components/firms/OnboardingSection.tsx (a "use
// client" module) even though that's its main consumer -- the Firms list
// page is a server component and needs these same lookup tables too;
// keeping them in a plain module avoids sending a client-component
// reference across the server/client boundary just to read a constant.
import type { BadgeTone } from "@/components/ui/Badge";

export const ONBOARDING_STATUS_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  in_progress: "accent",
  under_review: "warning",
  approved: "accent",
  setup: "accent",
  ready: "success",
  rejected: "danger",
  withdrawn: "neutral",
};

export const ONBOARDING_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  under_review: "Under Review",
  approved: "Approved",
  setup: "Setup",
  ready: "Ready",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export type PartnerOnboardingRow = {
  status: string;
  agreement_required: boolean;
  documents_required: boolean;
  training_required: boolean;
  bank_software_setup_required: boolean;
  application_submitted_at: string | null;
  agreement_signed: boolean;
  documents_completed: boolean;
  training_completed_at: string | null;
  bank_software_setup_completed_at: string | null;
  rejected_reason?: string | null;
  review_note?: string | null;
  created_at: string;
  updated_at?: string;
  completed_at: string | null;
};

export type ChecklistItemState = "complete" | "active" | "pending" | "not_required";
export type ChecklistItem = { key: string; label: string; state: ChecklistItemState };

export function daysSince(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// Six checklist rows regardless of status -- a requirement that doesn't
// apply to this partner/package renders "not_required" rather than being
// hidden, per the spec's "don't show a requirement as incomplete when it
// doesn't apply" -- but also never silently disappears, so a reviewer can
// still see what was deliberately skipped.
export function deriveChecklist(row: PartnerOnboardingRow): ChecklistItem[] {
  const items: ChecklistItem[] = [];

  items.push({ key: "application", label: "Application", state: row.application_submitted_at ? "complete" : "active" });

  items.push({
    key: "agreement",
    label: "Agreement",
    state: !row.agreement_required ? "not_required" : row.agreement_signed ? "complete" : row.application_submitted_at ? "active" : "pending",
  });

  items.push({
    key: "documents",
    label: "Documents",
    state: !row.documents_required ? "not_required" : row.documents_completed ? "complete" : row.application_submitted_at ? "active" : "pending",
  });

  const preReviewDone =
    Boolean(row.application_submitted_at) && (!row.agreement_required || row.agreement_signed) && (!row.documents_required || row.documents_completed);
  items.push({
    key: "review",
    label: "Review",
    state: ["approved", "setup", "ready"].includes(row.status)
      ? "complete"
      : row.status === "under_review"
        ? "active"
        : preReviewDone
          ? "active"
          : "pending",
  });

  items.push({
    key: "training",
    label: "Training",
    state: !row.training_required
      ? "not_required"
      : row.training_completed_at
        ? "complete"
        : ["approved", "setup"].includes(row.status)
          ? "active"
          : "pending",
  });

  items.push({
    key: "bank_software",
    label: "Bank & Software",
    state: !row.bank_software_setup_required
      ? "not_required"
      : row.bank_software_setup_completed_at
        ? "complete"
        : ["approved", "setup"].includes(row.status)
          ? "active"
          : "pending",
  });

  items.push({ key: "ready", label: "Ready", state: row.status === "ready" ? "complete" : "pending" });

  return items;
}

export type WaitingOn = { label: string; detail: string; moreCount: number };

// One primary blocker, named exactly the way a reviewer would say it out
// loud -- plus a count of anything else still outstanding, so a single
// headline never hides that more than one requirement remains (spec section 9).
export function deriveWaitingOn(row: PartnerOnboardingRow): WaitingOn {
  if (row.status === "ready") return { label: "Ready", detail: "No waiting action.", moreCount: 0 };
  if (row.status === "rejected") return { label: "Rejected", detail: row.rejected_reason || "Application was rejected.", moreCount: 0 };
  if (row.status === "withdrawn") return { label: "Withdrawn", detail: row.rejected_reason || "Partner withdrew from onboarding.", moreCount: 0 };
  if (row.status === "under_review") return { label: "Waiting on ERO/SB", detail: "Under review.", moreCount: 0 };

  const outstanding: WaitingOn[] = [];
  if (!row.application_submitted_at) outstanding.push({ label: "Waiting on Partner", detail: "Application not submitted.", moreCount: 0 });
  if (row.agreement_required && !row.agreement_signed) {
    outstanding.push({ label: "Waiting on Agreement", detail: "Agreement required but unsigned.", moreCount: 0 });
  }
  if (row.documents_required && !row.documents_completed) {
    outstanding.push({ label: "Waiting on Documents", detail: "Required documents incomplete.", moreCount: 0 });
  }
  if (row.training_required && !row.training_completed_at) {
    outstanding.push({ label: "Waiting on Training", detail: "Training required but incomplete.", moreCount: 0 });
  }
  if (row.bank_software_setup_required && !row.bank_software_setup_completed_at) {
    outstanding.push({ label: "Waiting on Bank/Software", detail: "Bank/software setup required but incomplete.", moreCount: 0 });
  }

  if (outstanding.length === 0) return { label: "Waiting on ERO/SB", detail: "Finishing up.", moreCount: 0 };
  const [primary, ...rest] = outstanding;
  return { ...primary, moreCount: rest.length };
}

// Keys that look like they might hold a tax ID, credential, or financial
// account number. Verexa already has an encrypted home for PTIN/EFIN/EIN
// (firm_tax_profile via set_firm_tax_profile) -- application_data is a
// plain jsonb catch-all with no such protection, so anything matching this
// shape is hidden rather than rendered, regardless of how it got there.
const SENSITIVE_KEY_PATTERN = /ssn|itin|efin|\bein\b|tax[_-]?id|password|secret|credential|token|account[_-]?number|routing[_-]?number|card[_-]?number|\bcvv\b|\bpin\b/i;

export type MaskedApplicationData = { visible: [string, string][]; hiddenCount: number };

function humanizeKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "--";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function maskApplicationData(data: unknown): MaskedApplicationData {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { visible: [], hiddenCount: 0 };
  const entries = Object.entries(data as Record<string, unknown>);
  const visible: [string, string][] = [];
  let hiddenCount = 0;
  for (const [key, value] of entries) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      hiddenCount += 1;
      continue;
    }
    visible.push([humanizeKey(key), stringifyValue(value)]);
  }
  return { visible, hiddenCount };
}
