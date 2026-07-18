import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#172622",
        charcoal: "#263B35",
        blue: "#22B8DB",
        teal: "#20C5AB",
        coolGray: "#EAF1EE",
        paper: "#F5FAF8",
        paperDim: "#EAF4F0",
        line: "#DDEAE5",
        green: "#22B866",
        amber: "#B45309",
        brick: "#B3261E",
        muted: "#60716B",
      },
      fontFamily: {
        slab: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
