function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

/** "#2563EB" -> "37 99 235", for use with Tailwind's rgb(var(--x) / <alpha-value>) pattern. */
export function hexToRgbTriplet(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? rgb.join(" ") : null;
}

/** Mixes a hex color toward white by `amount` (0-1) and returns an "R G B" triplet. */
export function lightenHexToRgbTriplet(hex: string, amount: number): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return rgb.map((c) => Math.round(c + (255 - c) * amount)).join(" ");
}

/** Mixes a hex color toward black by `amount` (0-1) and returns a "#rrggbb" string. */
export function darkenHex(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `#${rgb
    .map((c) => Math.round(c * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** "#2563EB" + 0.7 -> "rgba(37, 99, 235, 0.7)", for a muted/secondary variant of a solid text color. */
export function hexToRgba(hex: string, alpha: number): string | null {
  const rgb = parseHex(hex);
  return rgb ? `rgba(${rgb.join(", ")}, ${alpha})` : null;
}
