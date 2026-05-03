/** @type {Partial<import('tailwindcss').Config>} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Full navy scale
        navy: {
          50: 'rgb(var(--color-navy-50) / <alpha-value>)',
          100: 'rgb(var(--color-navy-100) / <alpha-value>)',
          500: 'rgb(var(--color-navy-500) / <alpha-value>)',
          700: 'rgb(var(--color-navy-700) / <alpha-value>)',
          800: 'rgb(var(--color-navy-800) / <alpha-value>)',
          900: 'rgb(var(--color-navy-900) / <alpha-value>)',
          950: 'rgb(var(--color-navy-950) / <alpha-value>)',
        },
        // Full amber scale
        amber: {
          50: 'rgb(var(--color-amber-50) / <alpha-value>)',
          100: 'rgb(var(--color-amber-100) / <alpha-value>)',
          400: 'rgb(var(--color-amber-400) / <alpha-value>)',
          500: 'rgb(var(--color-amber-500) / <alpha-value>)',
          700: 'rgb(var(--color-amber-700) / <alpha-value>)',
        },
        // Full ink (warm grey) scale
        ink: {
          50: 'rgb(var(--color-ink-50) / <alpha-value>)',
          100: 'rgb(var(--color-ink-100) / <alpha-value>)',
          200: 'rgb(var(--color-ink-200) / <alpha-value>)',
          300: 'rgb(var(--color-ink-300) / <alpha-value>)',
          500: 'rgb(var(--color-ink-500) / <alpha-value>)',
          700: 'rgb(var(--color-ink-700) / <alpha-value>)',
          950: 'rgb(var(--color-ink-950) / <alpha-value>)',
        },
        // Semantic with bg variant
        success: {
          DEFAULT: 'rgb(var(--color-success-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-success-foreground) / <alpha-value>)',
          bg: 'rgb(var(--color-success-100) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-warning-foreground) / <alpha-value>)',
          bg: 'rgb(var(--color-warning-100) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-danger-foreground) / <alpha-value>)',
          bg: 'rgb(var(--color-danger-100) / <alpha-value>)',
        },
        // Aliases
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
        },
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-body)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        // Body scale
        xs: ['0.75rem', { lineHeight: '1.4' }],
        sm: ['0.8125rem', { lineHeight: '1.5' }],     // 13
        base: ['0.9375rem', { lineHeight: '1.5' }],   // 15
        lg: ['1.0625rem', { lineHeight: '1.5' }],     // 17
        // Display scale (matches design doc)
        'display-sm': ['1.75rem', { lineHeight: '1.05', letterSpacing: '-0.015em' }],  // 28
        'display-md': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],   // 40
        'display-lg': ['4rem', { lineHeight: '1.04', letterSpacing: '-0.025em' }],     // 64
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        DEFAULT: '10px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        xs: '0 1px 1px rgb(0 0 0 / 0.04)',
        sm: '0 1px 2px rgb(0 0 0 / 0.05), 0 1px 1px rgb(0 0 0 / 0.03)',
        md: '0 4px 8px -2px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
        lg: '0 10px 20px -4px rgb(0 0 0 / 0.08), 0 4px 8px -4px rgb(0 0 0 / 0.04)',
      },
    },
  },
};