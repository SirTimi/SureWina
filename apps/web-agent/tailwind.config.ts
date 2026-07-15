import type { Config } from 'tailwindcss';
import surewinaPreset from '@surewina/config/tailwind/preset';

const config: Config = {
  presets: [surewinaPreset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
