import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Piazzolla } from "next/font/google";
import "./globals.css";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "VerexaHQ",
  description: "VerexaHQ business operating platform -- Tax Office module",
};

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const piazzolla = Piazzolla({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${piazzolla.variable}`}>
      <body>{children}</body>
    </html>
  );
}
