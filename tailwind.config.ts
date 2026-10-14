import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#eef5fb", 100: "#d6e6f5", 600: "#14598f", 700: "#0f4673", 800: "#0b3358", 900: "#082541" },
        gold: { 400: "#f5c542", 500: "#e8b012", 600: "#c4930a" },
        st: {
          reported: "#dc2626",
          investigating: "#c2410c",
          crew_dispatched: "#a16207",
          repair_in_progress: "#2563eb",
          testing: "#7c3aed",
          restored: "#15803d",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
