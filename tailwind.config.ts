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
        bg: { DEFAULT: '#fafbfd', soft: '#f4f6fa' },
        card: '#ffffff',
        border: { DEFAULT: '#e5e8ee', strong: '#d0d6e0' },
        hover: '#f7f9fc',
        text: { DEFAULT: '#1a2233', soft: '#4a5568', muted: '#7c8a9c', faint: '#a8b2bf' },
        primary: { DEFAULT: '#1f6dc9', dark: '#155aab', light: '#4a8ed8', pale: '#eef4fb', bg: '#f7faff' },
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
        mincho: ["'Shippori Mincho'", "'Noto Sans JP'", "serif"],
        sans: ["'Noto Sans JP'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        xs: '0 1px 2px rgba(20, 50, 90, 0.04)',
        sm: '0 2px 4px rgba(20, 50, 90, 0.06)',
        DEFAULT: '0 4px 12px rgba(20, 50, 90, 0.08)',
        lg: '0 16px 40px rgba(20, 50, 90, 0.16)',
      },
    },
  },
  plugins: [],
};
export default config;
