import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "Apple SD Gothic Neo",
          "sans-serif",
        ],
      },
      colors: {
        // Toss-style blue
        brand: {
          50: "#EAF2FE",
          100: "#D3E4FD",
          200: "#A9C9FB",
          300: "#7FAEF9",
          400: "#5598F7",
          500: "#3182F6",
          DEFAULT: "#3182F6",
          600: "#2272EB",
          700: "#1B64DA",
          800: "#1B519E",
        },
        // neutral ink scale
        ink: {
          DEFAULT: "#191F28",
          soft: "#4E5968",
          muted: "#8B95A1",
          faint: "#B0B8C1",
        },
        line: "#E5E8EB",
        surface: "#F2F4F6",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
        card: "0 4px 16px rgba(0,0,0,0.06)",
        lifted: "0 8px 28px rgba(0,0,0,0.10)",
        brand: "0 8px 20px rgba(49,130,246,0.28)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        blink: {
          "0%, 80%, 100%": { opacity: "0.25", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-2px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.28s ease-out both",
        blink: "blink 1.2s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
