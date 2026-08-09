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

export type OrganizerFieldOption = { label: string; value: string };

/**
 * organizer_fields.options is meant to hold {label, value} objects, but the
 * only writer that existed before this builder wrote plain strings instead
 * (comma-separated input split into an array) -- normalizing here means
 * existing choice fields built that way still render instead of showing
 * blank, valueless options.
 */
export function normalizeOptions(options: unknown): OrganizerFieldOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((o) => {
    if (typeof o === "string") return { label: o, value: o };
    if (o && typeof o === "object") {
      const obj = o as Record<string, unknown>;
      const value = obj.value !== undefined ? String(obj.value) : obj.label !== undefined ? String(obj.label) : "";
      const label = obj.label !== undefined ? String(obj.label) : value;
      return { label, value };
    }
    return { label: String(o), value: String(o) };
  });
}
