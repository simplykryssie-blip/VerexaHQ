/** Fetches a public image URL (e.g. a banner uploaded to the `branding`
 * storage bucket) as raw bytes for embedding in a server-rendered PDF.
 * Best-effort: returns null on any failure rather than throwing, since a
 * banner is decorative and shouldn't block rendering the document itself. */
export async function fetchImageBytes(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
