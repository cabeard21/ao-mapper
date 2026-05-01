# Runbook

## Starting the App

```bash
# 1. Start Docker services (PostgreSQL + Redis)
docker compose up -d

# 2. Start all packages in dev mode
pnpm dev
```

Services when running:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:3001 |
| API health | http://localhost:3001/health |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## Stopping the App

```bash
# Stop Node processes: Ctrl+C in the terminal running pnpm dev

# Stop Docker services (keeps data volumes)
docker compose down

# Stop and wipe all data
docker compose down -v
```

## Packet Sniffer

The sniffer forwards zone/location events to the API via WebSocket on port 10001. Run it separately from `pnpm dev`:

```bash
pnpm sniffer:dev
```

This runs the .NET sniffer at `packages/sniffer`. The API automatically reconnects if the sniffer restarts — no API restart needed.

## Database Migrations

Migrations run automatically on API startup. To run manually:

```bash
pnpm --filter api db:migrate
```

Migration files live in `packages/api/src/db/migrations/` and are numbered sequentially. Never edit existing migration files — add new ones instead.

## Game Data Import

Run after initial setup or after a game patch:

```bash
pnpm --filter @ao-mapper/etl load
```

This imports zone data from `refs/ao-bin-dumps` into the PostgreSQL database.

## Common Issues

### API won't start — "Failed to run migrations"

PostgreSQL isn't ready yet. Wait a few seconds and retry, or check:

```bash
docker compose ps        # postgres should show "healthy"
docker compose logs postgres
```

### Frontend can't connect to API

- Confirm the API is running: `curl http://localhost:3001/health`
- Check the API's `.env` has `PORT=3001`

### Sniffer not sending zone events

- Check the sniffer is running and pointed at the correct network interface
- Check `SNIFFER_WS_URL` in `.env` matches the sniffer's port (default `10001`)
- The API logs `[snifferClient]` messages — check for connection errors

### Portal connections not expiring

The `ExpiryService` polls every minute. If connections are stuck, restart the API — it will re-check all expiry times on startup.

### Redis connection errors

```bash
docker compose ps        # redis should show "healthy"
docker compose restart redis
```

Redis is used for route caching. The API falls back gracefully if Redis is unavailable, but route queries will be slower.
