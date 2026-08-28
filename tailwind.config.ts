import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        slate: "#1E293B",
        // Default accent is a vivid azure pulled from the actual brand mark
        // (public/brand/vmark.png's blue) -- any workspace with its own
        // Brand Center color set overrides this via --brand-accent-rgb, this
        // is just what an unbranded/new workspace sees.
        accent: "rgb(var(--brand-accent-rgb, 11 127 224) / <alpha-value>)",
        accentSoft: "rgb(var(--brand-accent-soft-rgb, 232 243 254) / <alpha-value>)",
        surface: "#FFFFFF",
        // A hair of blue bias instead of a flat gray -- reads as chosen
        // rather than inherited, and still neutral enough to sit under any
        // workspace's own accent color.
        surfaceMuted: "#F4F6FB",
        border: "#E3E7F0",
        muted: "#64748B",
        success: "#16A34A",
        successSoft: "#E3F4E9",
        warning: "#D97706",
        warningSoft: "#FAEFE1",
        danger: "#DC2626",
        dangerSoft: "#FBE5E5",
        // Categorical icon-chip palette -- for tagging *kinds* of things (a
        // stat card's subject, an activity feed row's action type), never
        // status. Kept separate from success/warning/danger, which stay
        // reserved for what Badge's doc comment calls "what the state means."
        emerald: "#10B981",
        emeraldSoft: "#E3FAF0",
        amber: "#F59E0B",
        amberSoft: "#FEF3DE",
        violet: "#7C6FEE",
        violetSoft: "#EFECFE",
        rose: "#FB7185",
        roseSoft: "#FDECEF",
      },
      fontFamily: {
        // Both loaded via next/font/google in app/layout.tsx, which exposes
        // them as CSS variables on <html> -- referencing the variable (with
        // the same fallback stack next/font itself appends) keeps Tailwind
        // and next/font's font-loading optimization in sync.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Serif display face for page titles and card headings -- the warmth
        // and trust that pairs with the sans body/data text.
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
      // Reopened the corner-sharpening pass from the old Settings redesign --
      // that dense, tight-radius look reads as flat/sterile in practice.
      // Softer, more generous radii read as a product people want to spend
      // their day in rather than an admin console.
      borderRadius: {
        lg: "10px",
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        // The one card shadow used everywhere a surface needs to lift off
        // surfaceMuted -- a tight near shadow for edge definition plus a
        // soft, wide falloff so it reads as "resting on the page," not
        // "outlined." Keep every card/panel on this one token rather than
        // ad hoc shadow-md/lg so the whole app lifts consistently.
        soft: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.06)",
        softHover: "0 2px 4px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
