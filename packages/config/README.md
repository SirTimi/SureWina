# @surewina/config

Shared configuration for the Surewina monorepo.

## Exports

- `@surewina/config/tsconfig/base.json` — base TypeScript config
- `@surewina/config/tsconfig/nextjs.json` — Next.js-specific TS config
- `@surewina/config/tsconfig/nestjs.json` — NestJS-specific TS config
- `@surewina/config/tailwind/preset` — shared Tailwind preset
- `@surewina/config/eslint/base` — shared ESLint config

## Usage

In a package or app's `tsconfig.json`:

```json
{
  "extends": "@surewina/config/tsconfig/base.json",
  "include": ["src/**/*"]
}
```

In an app's `tailwind.config.js`:

```javascript
const surewinaPreset = require('@surewina/config/tailwind/preset');
module.exports = {
  presets: [surewinaPreset],
  content: ['./src/**/*.{ts,tsx}'],
};
```