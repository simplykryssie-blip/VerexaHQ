import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VerexaHQ",
  description: "CRM for business service firms",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
