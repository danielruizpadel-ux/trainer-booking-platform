import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Landing de Mauri (propuesta B v2 aprobada por Dani, DECISIONS 009).
      // Azul acero y turquesa medidos en la camiseta de la foto real.
      colors: {
        mauri: {
          graphite: '#15191B',
          'graphite-2': '#1E2427',
          'graphite-line': '#2E3539',
          paper: '#FAF7F1',
          'paper-2': '#F2EEE6',
          rule: '#E3DDD1',
          'rule-2': '#D3CCBE',
          'ink-2': '#3A4145',
          muted: '#646B6E',
          'muted-d': '#9AA3A6',
          steel: '#20374D',
          teal: '#32677B',
          'teal-ink': '#24515F',
          'teal-tint': '#E4EEEF',
          'teal-light': '#8FC1C9',
        },
      },
      fontFamily: {
        'mauri-display': ['var(--font-mauri-display)', 'Arial Narrow', 'sans-serif'],
        'mauri-serif': ['var(--font-mauri-serif)', 'Georgia', 'serif'],
      },
      keyframes: {
        'mauri-fade': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'mauri-rise': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'mauri-settle': {
          from: { opacity: '0', transform: 'scale(1.05)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'mauri-pop': {
          '0%': { transform: 'scale(0.94)' },
          '60%': { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'mauri-fade': 'mauri-fade 320ms cubic-bezier(.2,.7,.2,1)',
        'mauri-pop': 'mauri-pop 300ms cubic-bezier(.2,.7,.2,1)',
        // Entrada del hero (solo con motion-safe); `both` deja el estado final.
        'mauri-rise': 'mauri-rise 750ms cubic-bezier(.2,.7,.2,1) both',
        'mauri-settle': 'mauri-settle 1400ms cubic-bezier(.2,.7,.2,1) both',
      },
    },
  },
  plugins: [],
} satisfies Config
