import tailwindcssAnimate from 'tailwindcss-animate';

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
      boxShadow: {
        '2xs': '0 1px 1px 0 rgba(0, 0, 0, 0.05)',
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      dropShadow: {
        '2xs': '0 0.5px 0.5px rgba(0, 0, 0, 0.15)',
        xs: '0 1px 1px rgba(0, 0, 0, 0.2)',
      },
      backdropBlur: {
        '2xs': '1px',
        xs: '2px',
      },
      borderWidth: {
        '3': '3px',
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
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-fast': 'pulse-fast 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-red': 'glow-red 1.5s ease-in-out infinite',
        'fade-in': 'fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        fadeIn: 'fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
