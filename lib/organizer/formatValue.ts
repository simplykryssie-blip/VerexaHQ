/**
 * Address answers can be a structured {street, city, state, zip} object
 * (e.g. prefilled from an on-file address) or a plain string typed into the
 * organizer's free-text address field -- this normalizes either into a
 * single display/edit string instead of the raw object.
 */
export function formatAddressValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const addr = value as Record<string, unknown>;
    const street = addr.street ? String(addr.street) : "";
    const cityState = [addr.city, addr.state].filter(Boolean).join(", ");
    const cityStateZip = [cityState, addr.zip].filter(Boolean).join(" ");
    return [street, cityStateZip].filter(Boolean).join(", ");
  }
  return value === null || value === undefined ? "" : String(value);
}
