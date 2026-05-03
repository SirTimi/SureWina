const surewinaPreset = require('@surewina/config/tailwind/preset');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [surewinaPreset],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};