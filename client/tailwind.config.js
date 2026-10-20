/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        industrial: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        qms: {
          brand: '#2563eb',
          brandDark: '#1d4ed8',
          amber: '#f59e0b',
          amberDark: '#b45309',
          emerald: '#10b981',
          emeraldDark: '#047857',
          rose: '#f43f5e',
          roseDark: '#be123c',
        },
      },
      fontFamily: {
        sans: ['Calibri', 'Carlito', 'Candara', 'Segoe UI', 'Optima', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'pulse-fast': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'glow-red': {
          '0%, 100%': {
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.6), inset 0 0 10px rgba(239, 68, 68, 0.4)',
          },
          '50%': {
            boxShadow: '0 0 4px rgba(239, 68, 68, 0.2)',
          },
        },
      },
      animation: {
        'pulse-fast': 'pulse-fast 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-red': 'glow-red 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
