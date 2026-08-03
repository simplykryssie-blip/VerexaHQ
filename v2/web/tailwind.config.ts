import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        slate: "#1E293B",
        accent: "#2563EB",
        accentSoft: "#DBEAFE",
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
    },
  },
  plugins: [],
};

export default config;
