export function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  // A leading "1" on an 11-digit number is the US/Canada country code, not
  // part of the area code -- strip it so it doesn't get formatted as if it
  // were the number's first digit (e.g. "15551234567" -> (555) 123-4567,
  // not (155) 512-3456).
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
