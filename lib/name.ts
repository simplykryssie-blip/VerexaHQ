/**
 * Conservative, blur-time-only name capitalization. Only touches input that
 * is uniformly all-lowercase or all-uppercase (careless/naive casing) --
 * capitalizes each word at its natural boundaries (space, hyphen,
 * apostrophe). Anything already containing a deliberate mix of case
 * (McDonald, O'Neal, DeSantos, ...) is returned completely unchanged, since
 * this function has no dictionary to verify a "correction" against and
 * would risk destroying an intentionally-spelled name.
 *
 * All-caps input ("MCDONALD") is a known, accepted limitation: it becomes
 * "Mcdonald", not "McDonald" -- an internal capital can't be reconstructed
 * from all-caps input without a name dictionary, and guessing would be
 * worse than leaving it predictable.
 */
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
