// JotForm-style row-sharing for organizer fields. Structural field types
// (section headers, page breaks, content blocks, repeating groups) always
// span the full row regardless of their stored layout_width -- a heading or
// a whole repeatable group can't meaningfully sit beside another field, so
// callers should route those through their own full-width rendering path
// rather than this helper.
const STRUCTURAL_FIELD_TYPES = new Set(["section", "page_break", "rich_text", "repeating_section"]);

// Half-width pairing reacts to the grid's own rendered width (a container
// query) rather than the browser viewport (sm:) -- the same "half" field
// needs to visually pair up inside a builder canvas or preview panel far
// narrower than the full viewport, on a properties-panel-crowded desktop
// window, a rotated/split-screen device, whatever. Every grid this renders
// into must carry the `@container` class for this to take effect (see
// FieldCanvas, OrganizerPreviewPanel, PublicOrganizerForm, portal
// OrganizerForm). 420px comfortably fits two form fields side by side
// without being so wide that a half field never pairs up in a merely
// medium-width container.
const WIDTH_COL_SPAN: Record<string, string> = {
  full: "col-span-12",
  half: "col-span-12 @[420px]:col-span-6",
};

export function fieldColSpanClass(fieldType: string, layoutWidth: string | null | undefined): string {
  if (STRUCTURAL_FIELD_TYPES.has(fieldType)) return "col-span-12";
  return WIDTH_COL_SPAN[layoutWidth ?? "full"] ?? "col-span-12";
}

export function isHalfWidth(layoutWidth: string | null | undefined): boolean {
  return layoutWidth === "half";
}

/** Whether a field of this type can be shrunk to share a row with a neighbor at all. */
export function isWidthEligible(fieldType: string): boolean {
  return !STRUCTURAL_FIELD_TYPES.has(fieldType);
}
