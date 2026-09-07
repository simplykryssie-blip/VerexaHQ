// Shared URL-slug sanitizer -- lowercases, collapses anything that isn't
// a-z/0-9 into a single hyphen, and trims leading/trailing hyphens. Used
// anywhere a page/website/service name needs a safe, routable slug so the
// same title always produces the same slug everywhere it's derived.
export function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "page"
  );
}
