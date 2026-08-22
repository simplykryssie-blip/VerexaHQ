export function formatEin(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function formatEfin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

// IRS PTIN format: the letter P followed by 8 digits.
export function formatPtin(value: string): string {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 8);
  return digits ? `P${digits}` : "";
}
