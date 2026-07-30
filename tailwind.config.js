/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sentinel: {
          bg: '#020617',
          panel: '#0F172A',
          border: '#334155',
          accent: '#22C55E',
          destructive: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'sans-serif'],
        heading: ['Lexend', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        }
      },
      animation: {
        marquee: 'marquee 180s linear infinite',
      }
    },
  },
  plugins: [],
}
