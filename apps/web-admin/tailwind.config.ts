import type { Config } from 'tailwindcss';
import  surewinaPreset from '@surewina/config/tailwind/preset'

const config: Config = {
  presets: [surewinaPreset as Config],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        admin: {
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
