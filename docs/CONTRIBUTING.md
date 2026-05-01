# Contributing

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for PostgreSQL 16 and Redis 7)

## Setup

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Copy environment file
cp .env.example .env

# 4. Run database migrations (runs automatically on API startup too)
pnpm --filter api db:migrate

# 5. Import game data (one-time, or after a game patch)
pnpm --filter @ao-mapper/etl load
```

## Development

<!-- AUTO-GENERATED: scripts -->
| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all packages in parallel (API :3001 + frontend :5173) |
| `pnpm build` | Build all packages (shared first, then rest in parallel) |
| `pnpm test` | Run all test suites recursively |
| `pnpm lint` | Lint all packages recursively |
| `pnpm type-check` | Type-check all packages recursively |
| `pnpm --filter api dev` | Start API only (:3001) |
| `pnpm --filter api db:migrate` | Run database migrations manually |
| `pnpm --filter api start` | Start compiled API (production) |
| `pnpm --filter frontend dev` | Start frontend only (:5173) |
| `pnpm --filter frontend preview` | Preview production frontend build |
<!-- END AUTO-GENERATED -->

## Environment Variables

<!-- AUTO-GENERATED: env -->
| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://ao_mapper:ao_mapper@localhost:5432/ao_mapper` |
| `REDIS_URL` | Yes | Redis connection string | `redis://localhost:6379` |
| `PORT` | No | API server port | `3001` |
| `SNIFFER_WS_URL` | No | WebSocket URL for the packet sniffer | `ws://127.0.0.1:10001/ws` |
<!-- END AUTO-GENERATED -->

## Testing

Tests use **Vitest** and are co-located with source files (`*.test.ts`).

```bash
pnpm test                    # all packages
pnpm --filter api test       # API only
pnpm --filter frontend test  # frontend only
```

## Code Style

- TypeScript 5.4 strict mode throughout
- Zod for all input validation at route/boundary level
- `ApiResponse<T>` / `PaginatedResponse<T>` envelope for all API responses
- Repository pattern for all DB access — no raw SQL outside `*Repository` classes
- Zustand store mutations must be immutable (spread, not mutate in-place)

## Database Migrations

SQL files live in `packages/api/src/db/migrations/` numbered sequentially (e.g., `001_create_zones.sql`). The API runs them automatically on startup. To add a new migration, create the next numbered file — never edit existing ones.

## Pull Request Checklist

- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] New functionality has test coverage
- [ ] No hardcoded secrets or debug `console.log` statements
