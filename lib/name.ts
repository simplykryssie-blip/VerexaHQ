/** Conservative name normalization used on blur for user-entered names. */
export function normalizeName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;

  const isAllLower = trimmed === trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase();
  const isAllUpper = trimmed === trimmed.toUpperCase() && trimmed !== trimmed.toLowerCase();
  if (!isAllLower && !isAllUpper) return trimmed;

  return trimmed
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_match, boundary: string, letter: string) => boundary + letter.toUpperCase());
}
