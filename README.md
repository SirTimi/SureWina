# Surewina

Regulated digital raffle platform for Nigeria.

## Stack

- **Backend:** NestJS (Fastify) + Prisma + PostgreSQL + Redis + BullMQ
- **Frontend:** Next.js 15 (App Router) + Tailwind CSS 3.4
- **Monorepo:** pnpm workspaces + Turborepo
- **Draw Engine:** Isolated NestJS microservice

## Apps

- `apps/api` — main backend (REST + WebSocket)
- `apps/draw-engine` — isolated draw execution service
- `apps/web-customer` — public customer-facing web app
- `apps/web-agent` — agent portal
- `apps/web-admin` — admin dashboard

## Shared packages

- `packages/types` — shared TypeScript types
- `packages/ui` — shared component library
- `packages/utils` — pure utility functions
- `packages/config` — shared TS, ESLint, Tailwind configs
- `packages/api-client` — typed API client

## Development

Prerequisites: Node 20+, pnpm 9+, Docker Desktop.

```bash
pnpm install
pnpm dev
```

## Documentation

See `docs/` for architecture decisions, runbooks, and the spec inconsistency log.