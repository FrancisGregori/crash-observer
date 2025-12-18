/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme colors (matching original dashboard)
        background: '#0f0f1a',
        'bg-secondary': '#1a1a2e',
        'bg-card': '#16162a',
        'bg-header': '#1e1e38',
        border: 'rgba(255, 255, 255, 0.1)',

        // Text colors
        'text-primary': '#ffffff',
        'text-secondary': '#b4b4b4',
        'text-muted': '#6b7280',

        // Accent colors
        accent: '#6366f1',
        'accent-hover': '#818cf8',

        // Status colors
        green: '#22c55e',
        red: '#ef4444',
        yellow: '#eab308',
        orange: '#f97316',
        cyan: '#06b6d4',
        pink: '#ec4899',
        purple: '#8b5cf6',

        // Multiplier colors
        'mult-low': '#ef4444',      // < 1.5x
        'mult-medium': '#f97316',   // 1.5-2x
        'mult-good': '#eab308',     // 2-3x
        'mult-great': '#22c55e',    // 3-5x
        'mult-excellent': '#06b6d4', // 5-10x
        'mult-epic': '#ec4899',     // 10-20x
        'mult-legendary': '#8b5cf6', // > 20x
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 2s linear infinite',
      },
    },
  },
  plugins: [],
};
