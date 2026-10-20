import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#101012",
        surface: "#1c1c1e",
        raised: "#2a2a2e",
        line: "#3a3a40",
        ink: "#f7f7f8",
        muted: "#a1a1aa",
        accent: "#22c55e",
        damage: "#ff7a18",
        gray: {
          50: "#101012",
          100: "#2a2a2e",
          200: "#3a3a40",
          300: "#6e6e76",
          400: "#9ca3af",
          500: "#a1a1aa",
          600: "#d4d4d8",
          700: "#e4e4e7",
          800: "#f4f4f5",
          900: "#f7f7f8",
        },
        brand: {
          50: "#052e16",
          100: "#14532d",
          200: "#166534",
          300: "#4ade80",
          400: "#4ade80",
          500: "#22c55e",
          600: "#22c55e",
          700: "#4ade80",
          800: "#bbf7d0",
          900: "#dcfce7",
        },
      },
      backgroundColor: {
        white: "#1c1c1e",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 8px 24px rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
