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
## Backend setup

The backend API lives in `apps/api`.

### Prerequisites

- Node.js 20 LTS
- pnpm 10.26.2
- Docker Desktop
- PostgreSQL and Redis through Docker Compose

### Start local infrastructure

```bash
docker compose up -d postgres redis

## Documentation

See `docs/` for architecture decisions, runbooks, and the spec inconsistency log.

Customer auth:

POST /v1/auth/otp/request
POST /v1/auth/otp/verify
POST /v1/auth/refresh
GET  /v1/auth/me
POST /v1/auth/sign-out

Agent auth:

POST /v1/agents/auth/otp/request
POST /v1/agents/auth/otp/verify
GET  /v1/agents/auth/me

Admin auth:

POST /v1/admin/auth/login
GET  /v1/admin/auth/me