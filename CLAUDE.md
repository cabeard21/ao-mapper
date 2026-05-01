# ao-mapper

Personal Albion Online portal mapping tool. Localhost-only, single-user, Windows. No auth, no multi-user features.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.4 |
| Frontend | React 18 + Vite 5, Cytoscape.js 3.29 + fcose, Zustand, TanStack Query v5 |
| API | Node.js + Express 4, `pg` (raw SQL), `ws` (WebSocket), Zod |
| ETL | ts-node (one-shot import scripts) |
| Database | PostgreSQL 16 + Redis 7 (Docker) |
| Testing | Vitest |
| Package manager | pnpm 9+ workspaces |

## Packages

| Package | Purpose |
|---------|---------|
| `packages/api` | Express REST API + WebSocket server (port 3001) |
| `packages/frontend` | React SPA (port 5173) |
| `packages/sniffer` | .NET packet sniffer — forwards zone events to API via WS (port 10001) |
| `packages/etl` | One-shot zone data import from game files |
| `packages/shared` | Shared TypeScript types (`Zone`, `Connection`, `ApiResponse<T>`) |
| `refs/` | Reference repos — read for patterns/data, never modified at runtime |

## Build & Run

```bash
# Start infrastructure
docker compose up -d

# Install deps
pnpm install

# Run database migrations
pnpm --filter api db:migrate

# Import game data (one-time, or after game patch)
pnpm --filter @ao-mapper/etl load

# Start all packages in dev mode (API + frontend)
pnpm dev

# Start the sniffer (separate terminal)
pnpm sniffer:dev             # .NET sniffer → WS :10001

# Start individually
pnpm --filter api dev        # :3001
pnpm --filter frontend dev   # :5173
```

## Testing

```bash
pnpm test                    # all packages
pnpm --filter api test       # api only
pnpm --filter frontend test  # frontend only
```

Test files: `*.test.ts` co-located with source files.

## Type Checking & Linting

```bash
pnpm type-check
pnpm lint
```

## Database Migrations

SQL files in `packages/api/src/db/migrations/` (numbered, e.g., `001_create_zones.sql`).
Migrations run automatically on `api` startup via `migrate()` in `src/db/migrate.ts`.
Manual run: `pnpm --filter api db:migrate`.

## Key Conventions

### API responses
Always use `ApiResponse<T>` or `PaginatedResponse<T>` from `@ao-mapper/shared`:
```ts
{ success: boolean, data: T | null, error: string | null, meta?: { total, page, limit } }
```

### Input validation
Use Zod schemas on all route query params and request bodies before touching the DB.

### Error handling
`error: unknown` → narrow with `instanceof Error` or `instanceof z.ZodError`. Never `any`.

### Repository pattern
All DB access goes through a `*Repository` class in `packages/api/src/repositories/`.
Repositories receive a `Pool` via constructor injection.

### Frontend state
Zustand store (`mapStore.ts`) owns all graph state. All mutations must be immutable (spread, not mutate in-place).

### Component structure
Each component lives in its own directory: `components/ComponentName/ComponentName.tsx`.

### Real-time events
WebSocket message types: `connection:created`, `connection:updated`, `connection:deleted`, `connection:expired`, `zone:current`, `route:updated`.
Sniffer (.NET, `pnpm sniffer:dev`, port 10001) → API WS client → broadcast to frontend.

## Environment Variables

Copy `.env.example` → `.env`. Required:

```
DATABASE_URL=postgresql://ao_mapper:ao_mapper@localhost:5432/ao_mapper
REDIS_URL=redis://localhost:6379
PORT=3001
SNIFFER_WS_URL=ws://localhost:10001/ws
```

## Project Status

MVP (Steps 1–12) is complete. Post-MVP items not yet started:
- Step 13: OCR hotkey service (Python) for auto-reading portal tooltips
- Step 14: `start.bat` packaging for one-click startup

See `plans/ao-mapper-implementation.md` for the full step-by-step blueprint.
