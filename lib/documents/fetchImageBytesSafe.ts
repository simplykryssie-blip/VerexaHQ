import { safeFetchBuffer } from "@/lib/security/safeFetch";

// VEREXA SSRF (banner image): server-only counterpart to
// lib/documents/fetchImageBytes.ts, for the one caller that runs on the
// server (app/api/documents/file-signed-engagement-letter/route.ts) rather
// than in the browser. That route fetches an engagement-letter template's
// banner_image_url with no caller-side control over the destination -- the
// value is read straight out of the database -- so the fetch itself must
// validate and pin the destination the same way the automation-webhook
// fetch does (see lib/security/safeFetch.ts), plus cap the response size
// since this caller (unlike the webhook) actually reads the body.
//
// This is deliberately a separate file from fetchImageBytes.ts rather than
// a change to it: fetchImageBytes.ts is also imported by
// lib/documents/createSignatureRequestFromTemplate.ts, which is used from
// "use client" components (components/documents/SignaturesPanel.tsx,
// components/firms/OnboardingSection.tsx) and therefore runs in the
// browser -- safeFetch's use of node:dns/node:http would fail to bundle (or
// fail at runtime) in that client path. That browser-side path makes its
// own fetch from the staff member's own browser, not from this server, and
// is intentionally not touched here; it is a separate, lower-severity
// finding.
//
// Best-effort, same contract as fetchImageBytes: returns null on any
// failure (network, blocked destination, oversized response, or a response
// that pdf-lib can't embed as an image) rather than throwing, since a
// banner is decorative and shouldn't block rendering the document itself.
// Never leaks which of those happened, or any destination/DNS detail, to
// the caller.
export async function fetchImageBytesSafe(url: string | null | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const res = await safeFetchBuffer(url);
    if (!res.ok) return null;
    return new Uint8Array(res.body);
  } catch {
    // Covers a blocked destination, an oversized response, and any network
    // failure alike -- all are expected, best-effort outcomes here.
    return null;
  }
}
