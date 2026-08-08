// Auto-formatting/masking for system-template organizer questions
// (Client-First System Template Experience standard). Pure functions so
// they're usable both in the live-typing mask and in one-off validation,
// and easy to unit-test in isolation from the React tree.
import type { OrganizerFormatType } from "./types";

function digitsOnly(raw: string, max: number): string {
  return raw.replace(/\D/g, "").slice(0, max);
}

export function maskSsn(raw: string): string {
  const d = digitsOnly(raw, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

export function maskEin(raw: string): string {
  const d = digitsOnly(raw, 9);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}-${d.slice(2)}`;
}

export function maskPhone(raw: string): string {
  const d = digitsOnly(raw, 10);
  if (d.length === 0) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function maskZip(raw: string): string {
  const d = digitsOnly(raw, 9);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function maskPercentage(raw: string): string {
  // Digits and a single decimal point only -- percentages don't need
  // thousands separators or a currency symbol.
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

export type FormatConfig = {
  mask: (raw: string) => string;
  example: string;
  placeholder: string;
  isComplete: (masked: string) => boolean;
  errorMessage: string;
  inputMode: "numeric" | "decimal";
};

// Only ssn/ein are real organizer_fields.field_type values — the organizer
// form only ever needs this config for those two. maskPhone/maskZip/
// maskPercentage above remain general-purpose exports used elsewhere
// (e.g. ClientModal's zip field, PayrollClientModal's FEIN field).
export const ORGANIZER_FORMAT_CONFIG: Record<OrganizerFormatType, FormatConfig> = {
  ssn: {
    mask: maskSsn,
    example: "123-45-6789",
    placeholder: "123-45-6789",
    isComplete: (v) => /^\d{3}-\d{2}-\d{4}$/.test(v),
    errorMessage: "Please enter a valid SSN. Example: 123-45-6789",
    inputMode: "numeric",
  },
  ein: {
    mask: maskEin,
    example: "12-3456789",
    placeholder: "12-3456789",
    isComplete: (v) => /^\d{2}-\d{7}$/.test(v),
    errorMessage: "Please enter a valid EIN. Example: 12-3456789",
    inputMode: "numeric",
  },
};
