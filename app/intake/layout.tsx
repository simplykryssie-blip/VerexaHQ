import type { Metadata } from "next";

// Public tax-intake pages: never indexed, never leak a referrer carrying a
// token in the URL to a destination site, and intentionally outside the
// authenticated (app) shell -- no staff nav, no session requirement.
export const metadata: Metadata = {
  title: "Tax Intake",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-paper">{children}</div>;
}
