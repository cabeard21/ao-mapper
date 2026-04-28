# ao-mapper

ao-mapper is a work-in-progress web tool for mapping Albion Online zones and
portal connections. It provides a graph-based map UI, an Express API, database
persistence, routing support, and import tooling for zone data.

## Project Structure

This repository is a pnpm workspace with four packages:

- `packages/frontend` - Vite + React map UI using Cytoscape for graph rendering.
- `packages/api` - Express API, PostgreSQL repositories, WebSocket updates, and
  route optimization services.
- `packages/etl` - zone import tooling for loading Albion data into Postgres.
- `packages/shared` - shared TypeScript API and domain types.

Reference repositories used during development are checked in as git submodules
under `refs/`.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer
- Docker and Docker Compose for local Postgres and Redis

## Setup

Install dependencies:

```bash
pnpm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Start the local services:

```bash
docker compose up -d
```

The default environment values are:

```bash
DATABASE_URL=postgresql://ao_mapper:ao_mapper@localhost:5432/ao_mapper
REDIS_URL=redis://localhost:6379
PORT=3001
SNIFFER_WS_URL=ws://localhost:10001/ws
```

## Development

Run the API and frontend development servers:

```bash
pnpm dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` and `/ws`
traffic to the API on `http://localhost:3001`.

Run database migrations manually:

```bash
pnpm --filter @ao-mapper/api db:migrate
```

The API also runs migrations automatically on startup.

Import zone data:

```bash
pnpm --filter @ao-mapper/etl import
```

Build all packages:

```bash
pnpm build
```

## Quality Checks

Run the test suite:

```bash
pnpm test
```

Run TypeScript checks:

```bash
pnpm type-check
```

Run package lint scripts:

```bash
pnpm lint
```

## API Overview

The API exposes:

- `GET /health` - service health and uptime.
- `GET /api/zones` - paginated zone list with optional query, tier, and type
  filters.
- `GET /api/zones/search?q=...` - zone search.
- `GET /api/zones/:id` - zone details.
- `GET /api/connections` - active portal connections.
- `GET /api/connections/expired` - expired portal connections.
- `POST /api/connections` - create a connection.
- `PATCH /api/connections/:id` - update a connection.
- `DELETE /api/connections/:id` - delete a connection.
- `GET /api/route?from=...&to=...` - calculate a route between zones.
- `GET /api/route/to-city?from=...` - calculate city distances from a zone.

The API broadcasts realtime map changes over the `/ws` WebSocket endpoint.

## Notes

- `docs/description.txt` contains the product notes and longer-term feature
  goals.
- The sniffer integration expects a local WebSocket service at `SNIFFER_WS_URL`
  when packet-derived zone/location data is available.
