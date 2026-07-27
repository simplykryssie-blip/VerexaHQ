import type { Metadata } from "next";

// Public tax-intake pages: never indexed, never leak a referrer carrying a
// token in the URL to a destination site, and structurally outside the
// authenticated (app) shell -- these pages live in the (public) route
// group specifically so they can never inherit an authenticated layout by
// accident. No staff nav, no session requirement, no session check
// anywhere in this tree.
export const metadata: Metadata = {
  title: "Tax Intake",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// Temporary diagnostic marker (non-sensitive: just the short commit SHA
// Vercel injects at build time) so it's possible to independently confirm
// exactly which deployment is serving a given page load, from page source
// alone (view-source shows a <meta name="x-verexa-build">), without
// relying on Vercel's own dashboard/API. Safe to remove once the
// deployment-routing investigation for PR #7 is closed out.
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA || "unknown").slice(0, 7);
metadata.other = { "x-verexa-build": BUILD_SHA };

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-paper">{children}</div>;
}
