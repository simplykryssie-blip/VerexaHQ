export type AddressParts = { street: string; street2: string; city: string; state: string; zip: string };

const EMPTY_ADDRESS: AddressParts = { street: "", street2: "", city: "", state: "", zip: "" };

/** The address field's answer is stored as a JSON-stringified {street, street2, city, state, zip} object. */
export function parseAddressValue(value: string): AddressParts {
  if (!value) return { ...EMPTY_ADDRESS };
  try {
    const obj = JSON.parse(value);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const addr = obj as Record<string, unknown>;
      return {
        street: addr.street ? String(addr.street) : "",
        street2: addr.street2 ? String(addr.street2) : "",
        city: addr.city ? String(addr.city) : "",
        state: addr.state ? String(addr.state) : "",
        zip: addr.zip ? String(addr.zip) : "",
      };
    }
  } catch {
    // Not JSON -- an older plain-text address typed before structured entry existed.
  }
  return { ...EMPTY_ADDRESS, street: value };
}

export function stringifyAddressValue(parts: AddressParts): string {
  return JSON.stringify(parts);
}

/**
 * Normalizes a raw address answer -- a real {street, ...} object (e.g.
 * prefilled from an on-file address) or a JSON/plain string already in this
 * field's stored shape -- into the JSON string parseAddressValue expects, so
 * editable form state never loses structure on load.
 */
export function coerceAddressAnswerToString(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const addr = value as Record<string, unknown>;
    return stringifyAddressValue({
      street: addr.street ? String(addr.street) : "",
      street2: addr.street2 ? String(addr.street2) : "",
      city: addr.city ? String(addr.city) : "",
      state: addr.state ? String(addr.state) : "",
      zip: addr.zip ? String(addr.zip) : "",
    });
  }
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Address answers can be the structured {street, street2, city, state, zip}
 * object this field now stores (as a JSON string, or already-parsed JSONB
 * from the database), or a plain string from before structured entry existed
 * -- this normalizes any of those into a single display/edit string.
 */
export function formatAddressValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const addr = value as Record<string, unknown>;
    const street = [addr.street, addr.street2].filter(Boolean).join(", ");
    const cityState = [addr.city, addr.state].filter(Boolean).join(", ");
    const cityStateZip = [cityState, addr.zip].filter(Boolean).join(" ");
    return [street, cityStateZip].filter(Boolean).join(", ");
  }
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(value);
      if (obj && typeof obj === "object") return formatAddressValue(obj);
    } catch {
      // Fall through to plain-string handling below.
    }
  }
  return value === null || value === undefined ? "" : String(value);
}

export type NameParts = { first: string; middle: string; last: string; suffix: string };

const EMPTY_NAME: NameParts = { first: "", middle: "", last: "", suffix: "" };

/** The name field's answer is stored as a JSON-stringified {first, middle, last, suffix} object. */
export function parseNameValue(value: string): NameParts {
  if (!value) return { ...EMPTY_NAME };
  try {
    const obj = JSON.parse(value);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const name = obj as Record<string, unknown>;
      return {
        first: name.first ? String(name.first) : "",
        middle: name.middle ? String(name.middle) : "",
        last: name.last ? String(name.last) : "",
        suffix: name.suffix ? String(name.suffix) : "",
      };
    }
  } catch {
    // Not JSON -- treat a plain string as a first name, same graceful
    // fallback formatAddressValue uses for pre-structured answers.
  }
  return { ...EMPTY_NAME, first: value };
}

export function stringifyNameValue(parts: NameParts): string {
  return JSON.stringify(parts);
}

/**
 * Normalizes a raw name answer -- a real {first, ...} object (e.g. prefilled
 * from the client's record) or a JSON/plain string already in this field's
 * stored shape -- into the JSON string parseNameValue expects, so editable
 * form state never loses structure on load.
 */
export function coerceNameAnswerToString(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = value as Record<string, unknown>;
    return stringifyNameValue({
      first: name.first ? String(name.first) : "",
      middle: name.middle ? String(name.middle) : "",
      last: name.last ? String(name.last) : "",
      suffix: name.suffix ? String(name.suffix) : "",
    });
  }
  return value === null || value === undefined ? "" : String(value);
}

/**
 * Name answers can be the structured {first, middle, last, suffix} object
 * this field stores (as a JSON string, or already-parsed JSONB from the
 * database), or a plain string -- normalizes any of those into a single
 * display string.
 */
export function formatNameValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = value as Record<string, unknown>;
    return [name.first, name.middle, name.last, name.suffix].filter(Boolean).join(" ");
  }
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const obj = JSON.parse(value);
      if (obj && typeof obj === "object") return formatNameValue(obj);
    } catch {
      // Fall through to plain-string handling below.
    }
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
