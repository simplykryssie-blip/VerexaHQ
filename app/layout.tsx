import type { Metadata } from "next";
import "./globals.css";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Verexa HQ CRM",
  description: "Verexa HQ CRM business operating platform -- Tax Office module",
};

// Keep production builds deterministic. next/font/google requires a build-time
// fetch from Google's font service; when that response is unavailable or
// malformed, the entire Vercel build fails before application code compiles.
// Use the same broadly compatible UI/display stacks through CSS variables
// instead, with no external build-time dependency.
const fontSans = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const fontDisplay = "ui-serif, Georgia, Cambria, 'Times New Roman', serif";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      style={
        {
          "--font-sans": fontSans,
          "--font-display": fontDisplay,
        } as React.CSSProperties
      }
    >
      <body>{children}</body>
    </html>
  );
}
