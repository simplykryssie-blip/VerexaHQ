import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        slate: "#1E293B",
        accent: "rgb(var(--brand-accent-rgb, 37 99 235) / <alpha-value>)",
        accentSoft: "rgb(var(--brand-accent-soft-rgb, 219 234 254) / <alpha-value>)",
        surface: "#FFFFFF",
        surfaceMuted: "#F8FAFC",
        border: "#E2E8F0",
        muted: "#64748B",
        success: "#16A34A",
        warning: "#D97706",
        danger: "#DC2626",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Sitewide corner-sharpening pass: rounded-lg/xl/2xl read as "bubbly" at
      // Tailwind's default sizes. Tightening just these three keys pulls every
      // card, input, button, and modal in the app toward the denser, more
      // structured look from the Settings redesign, without touching `full`
      // (avatars, status dots, toggle switches -- legitimately circular).
      borderRadius: {
        lg: "4px",
        xl: "6px",
        "2xl": "8px",
      },
    },
  },
  plugins: [],
};

export default config;
