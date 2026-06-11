import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: '#ffffff', soft: '#f4f8f5' },
        card: '#ffffff',
        border: { DEFAULT: '#e4ebe6', strong: '#ccdad1' },
        hover: '#f2f8f4',
        text: { DEFAULT: '#1f2b25', soft: '#4a5a51', muted: '#7c8d83', faint: '#a8b6ad' },
        primary: { DEFAULT: '#2f9e63', dark: '#237d4d', light: '#5cb887', pale: '#e6f4ec', bg: '#f3faf6' },
        bar: { DEFAULT: '#ddf0e4', soft: '#eaf6ef', border: '#c6e4d2' },
        accent: {
          orange: { DEFAULT: '#ed8936', bg: '#fef5ec' },
          green: { DEFAULT: '#38a169', bg: '#f0f9f4' },
          yellow: { DEFAULT: '#d69e2e', bg: '#fdf8e9' },
          teal: { DEFAULT: '#319795', bg: '#ebf8f8' },
          red: { DEFAULT: '#e53e3e', bg: '#fdf0f0' },
          purple: { DEFAULT: '#805ad5', bg: '#f5f0fc' },
        },
      },
      fontFamily: {
        sans: ["'Noto Sans JP'", "'Hiragino Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        xs: '0 1px 3px rgba(35, 84, 58, 0.05)',
        sm: '0 2px 8px rgba(35, 84, 58, 0.07)',
        DEFAULT: '0 4px 16px rgba(35, 84, 58, 0.09)',
        lg: '0 16px 40px rgba(35, 84, 58, 0.15)',
      },
    },
  },
  plugins: [],
};
export default config;
