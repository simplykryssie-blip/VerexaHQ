export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 9);
}

/** True once an optional-but-if-present tax ID has exactly 9 digits -- an
 * empty value passes (the field is optional), a partial one doesn't. */
export function isValidTaxId(value: string): boolean {
  return value === "" || digitsOnly(value).length === 9;
}

export function formatEin(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

// SSN and ITIN share the same 9-digit XXX-XX-XXXX layout.
export function formatSsn(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function formatEfin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

// IRS PTIN format: the letter P followed by 8 digits.
export function formatPtin(value: string): string {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 8);
  return digits ? `P${digits}` : "";
}
