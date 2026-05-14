import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F8FAF4',
        admin: {
          green: '#4E8F01',
          lime: '#A8E368',
          ink: '#0B1220',
          slate: '#111827',
          rail: '#0F172A',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
