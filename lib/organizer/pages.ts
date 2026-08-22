// A "page_break" field is a structural marker, not a question -- it never
// renders as an input. Splitting on it is shared by every organizer renderer
// (public, portal, builder preview) so page breaks behave identically
// everywhere. Fields already filtered out by conditional logic are simply
// absent from the list this receives, so a page left with nothing visible in
// it collapses away instead of showing an empty step. A page break's own
// label doubles as the title of the page that follows it.
export type OrganizerPage<T> = { title: string | null; fields: T[] };

export function splitIntoPages<T extends { field_type: string; label: string }>(fields: T[]): OrganizerPage<T>[] {
  const pages: OrganizerPage<T>[] = [{ title: null, fields: [] }];
  for (const f of fields) {
    if (f.field_type === "page_break") {
      pages.push({ title: f.label.trim() || null, fields: [] });
    } else {
      pages[pages.length - 1].fields.push(f);
    }
  }
  const nonEmpty = pages.filter((p) => p.fields.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : [{ title: null, fields: [] }];
}
