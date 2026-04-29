# Blueprint: ao-mapper — Albion Online Portal Mapping Tool

**Status**: Planning complete — ready for implementation
**Created**: 2026-04-28
**Steps**: 14 total (12 MVP + 2 post-MVP)
**Parallel opportunities**: Steps 3, 4, 5, 8 after Step 2 merges

---

## Context

ao-mapper is a local personal tool (single-user, runs on Windows) that makes portal connection mapping in Albion Online as easy as possible. The user needs an interactive graph UI for managing zone nodes and portal connections, populated with real game data, with automatic zone detection via packet sniffer and a route optimizer for fastest-path navigation.

**This is NOT a hosted multi-user app.** No auth, no guild sharing, no Discord bot. The goal is a "just works on localhost" personal tool.

**All four reference repos are reused, not reimplemented:**
- `refs/portaler-modern` — steal Cytoscape.js graph patterns, React component structure, Express+PG patterns
- `refs/ao-bin-dumps` — one-shot ETL at setup; never touched at runtime
- `refs/avalon-roads` — steal `maps.json` schema and icon/image assets
- `refs/sniffer` — run as separate Python process; backend subscribes to its WebSocket

---

## Architecture

```
ao-mapper/
├── packages/
│   ├── frontend/     React + TypeScript + Vite + Cytoscape.js + Zustand
│   ├── api/          Node.js + Express + TypeScript (REST + WebSocket)
│   ├── etl/          One-shot data import scripts (ao-bin-dumps → PG)
│   └── shared/       TypeScript types shared between frontend and api
├── docker-compose.yml   PostgreSQL + Redis
├── pnpm-workspace.yaml
└── package.json
```

**Runtime topology (local):**
```
[Albion Online] ──UDP 5056──▶ [Python sniffer] ──WS 10001──▶ [api] ──WS──▶ [frontend]
[ao-bin-dumps]  ──one-shot──▶ [etl]            ──SQL──────▶ [PostgreSQL]
                                                               ▲
                                                          [api REST]
                                                               ▲
                                                          [frontend]
```

---

## Implementation Steps

Dependencies are marked with `→`. Steps with no dependency edge can run in parallel.

---

### Step 1 — Monorepo Foundation & Docker Compose
**Branch**: `feat/foundation`
**Model tier**: default

**Context brief**: Empty repo. Need a pnpm monorepo with four packages, Docker Compose for Postgres + Redis, and a minimal CI workflow.

**Task list**:
- [ ] `pnpm-workspace.yaml` with `packages/*` glob
- [ ] Root `package.json` (scripts: `dev`, `build`, `test`, `lint`)
- [ ] `packages/shared/` — TypeScript package, `tsconfig.json`, `src/types/` (empty stubs)
- [ ] `packages/api/` — Express + TypeScript skeleton (`src/index.ts`, `nodemon`, `ts-node-dev`)
- [ ] `packages/frontend/` — Vite + React + TypeScript via `create vite` template
- [ ] `packages/etl/` — plain TypeScript scripts package
- [ ] `docker-compose.yml` — postgres:16, redis:7, persistent volumes, `ao_mapper` DB
- [ ] `docker-compose.override.yml` — dev overrides (port forwarding)
- [ ] `.env.example` — `DATABASE_URL`, `REDIS_URL`, `PORT`, `SNIFFER_WS_URL`
- [ ] `.gitignore` — node_modules, dist, .env
- [ ] GitHub Actions CI: pnpm install, type-check, lint on push

**Verification**:
```bash
docker compose up -d
pnpm install
pnpm --filter api dev   # server starts on :3001
pnpm --filter frontend dev  # Vite starts on :5173
```

**Exit criteria**: All packages install; Express returns 200 on GET /health; Vite serves blank page; Postgres accepts connections.

---

### Step 2 — Shared Types & Database Schema
**Branch**: `feat/schema`
**Depends on**: Step 1
**Model tier**: default

**Context brief**: Define the PostgreSQL schema and the TypeScript types shared by frontend and api. Zones come from game data; connections are user-created; portal_timers track expiry.

**Task list**:
- [ ] `packages/api/src/db/` — `knex` or `pg` client setup, connection pool
- [ ] Migration `001_create_zones.sql`:
  - `zones(id UUID PK, unique_name TEXT UNIQUE, display_name TEXT, tier INT, zone_type TEXT, city_distance JSONB, resources JSONB, metadata JSONB, created_at TIMESTAMPTZ)`
- [ ] Migration `002_create_connections.sql`:
  - `connections(id UUID PK, from_zone_id UUID FK, to_zone_id UUID FK, conn_type TEXT, duration_hours REAL, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`
- [ ] Migration `003_create_user_layout.sql`:
  - `node_positions(zone_id UUID FK, x REAL, y REAL)` — persist Cytoscape node positions
- [ ] `packages/shared/src/types/zone.ts` — `Zone`, `ZoneType`, `Resource`, `CityDistance`
- [ ] `packages/shared/src/types/connection.ts` — `Connection`, `ConnectionType`, `PortalTimer`
- [ ] `packages/shared/src/types/api.ts` — `ApiResponse<T>`, `PaginatedResponse<T>`
- [ ] Run migrations on `docker compose up` via init script

**Verification**:
```bash
pnpm --filter api db:migrate
psql $DATABASE_URL -c "\dt"   # shows zones, connections, node_positions
```

**Exit criteria**: All three tables exist; TypeScript types compile without errors.

---

### Step 3 — ETL: Game Data → PostgreSQL
**Branch**: `feat/etl`
**Depends on**: Step 2
**Model tier**: default

**Context brief**: One-shot import of zone data from `refs/ao-bin-dumps/formatted/world.json` (zone names/IDs) and `refs/avalon-roads/src/data/maps.json` (tier, resources, chests, dungeons). Also classify `zone_type` (royal, black zone, red, yellow, blue, roads) from naming conventions in the game data.

**Key file references**:
- `refs/ao-bin-dumps/formatted/world.json` — `{Index, UniqueName}[]`
- `refs/avalon-roads/src/data/maps.json` — `{id, name, tier, resources[], chests[], dungeons[]}`
- `refs/portaler-modern/packages/bin-etl/` — reference for ETL patterns

**Task list**:
- [ ] `packages/etl/src/importZones.ts` — merge world.json + maps.json by zone name matching
- [ ] Zone type classifier (regex/lookup on `UniqueName` prefix patterns: `_Black_`, `_Swamp_`, `ROADS_`, etc.)
- [ ] City distance pre-calculator: hardcode Caerleon, Bridgewatch, etc. as origin nodes; run BFS on static royal road connections from game data to populate `city_distance` JSONB
- [ ] Upsert zones into PostgreSQL (idempotent: re-run is safe)
- [ ] `packages/etl/src/importAvalonRoads.ts` — import avalon road zone metadata separately
- [ ] NPM script: `pnpm --filter @ao-mapper/etl load` to run the full ETL
- [ ] Copy icon assets from `refs/avalon-roads/public/icons/` → `packages/frontend/public/icons/`

**Verification**:
```bash
pnpm --filter @ao-mapper/etl load
psql $DATABASE_URL -c "SELECT count(*) FROM zones;"   # ~900+ zones expected
psql $DATABASE_URL -c "SELECT unique_name, tier, zone_type FROM zones LIMIT 10;"
```

**Exit criteria**: 800+ zones loaded; each zone has tier and zone_type populated; ETL is idempotent (run twice = same row count).

---

### Step 4 — Backend: Zone API
**Branch**: `feat/zone-api`
**Depends on**: Step 2
**Model tier**: default

**Context brief**: REST endpoints for reading zone data. Zones are read-mostly (populated by ETL, not user-created). The user selects zones to add to their map; the API returns their metadata.

**Task list**:
- [ ] `GET /api/zones` — list/search zones (query params: `q`, `tier`, `type`, `limit`, `offset`)
- [ ] `GET /api/zones/:id` — single zone with full metadata
- [ ] `GET /api/zones/search?q=:name` — typeahead search by display_name
- [ ] Express router at `src/routes/zones.ts`
- [ ] Repository pattern: `src/repositories/ZoneRepository.ts`
- [ ] Input validation (zod or joi) on all query params
- [ ] Unit tests for ZoneRepository with test fixtures

**Verification**:
```bash
curl "http://localhost:3001/api/zones?q=tharcal&tier=6"
curl "http://localhost:3001/api/zones/search?q=cases"
```

**Exit criteria**: Search returns JSON with correct zones; 404 for unknown zone ID; input validation rejects invalid params.

---

### Step 5 — Backend: Connections API
**Branch**: `feat/connections-api`
**Depends on**: Step 2
**Model tier**: default

**Context brief**: REST endpoints for user-managed portal connections. Connections are user-created, have a type (BZ portal, avalon road, etc.) and optional expiry timer. This is the core data the mapper stores.

**Task list**:
- [ ] `GET /api/connections` — list all active connections (excludes expired)
- [ ] `POST /api/connections` — create connection `{fromZoneId, toZoneId, connType, durationHours?}`
- [ ] `PATCH /api/connections/:id` — update duration/type
- [ ] `DELETE /api/connections/:id` — remove connection
- [ ] `GET /api/connections/expired` — list recently-expired connections
- [ ] Repository: `src/repositories/ConnectionRepository.ts`
- [ ] Background job (setInterval): mark connections expired when `expires_at < now()`; emit `connection:expired` via WS
- [ ] Node position endpoints: `PUT /api/layout/:zoneId` — save x/y

**Verification**:
```bash
curl -X POST http://localhost:3001/api/connections \
  -H "Content-Type: application/json" \
  -d '{"fromZoneId":"...", "toZoneId":"...", "connType":"BZ_PORTAL", "durationHours": 22}'
curl http://localhost:3001/api/connections
```

**Exit criteria**: Full CRUD works; expired connections are excluded from GET list; WS emits expire event.

---

### Step 6 — Backend: Route Optimizer
**Branch**: `feat/route-optimizer`
**Depends on**: Steps 4, 5
**Model tier**: strongest (complex algorithm)

**Context brief**: Given a source zone and destination zone, find the shortest path using Dijkstra's algorithm over the active connection graph (all non-expired connections). Must include avalon road hops. Also compute distance from any zone to each major city.

**Reference**: `refs/portaler-modern/packages/frontend/src/` for graph model patterns.

**Task list**:
- [ ] `src/services/RouteOptimizer.ts` — in-memory adjacency list built from `connections` + static royal road edges
- [ ] Dijkstra implementation (edge weight = 1 hop unless we have travel time data)
- [ ] `GET /api/route?from=:zoneId&to=:zoneId` — returns ordered array of zone IDs + hop count
- [ ] `GET /api/route/to-city?from=:zoneId` — returns distance to all 6 major cities
- [ ] Cache route graph in Redis (invalidate on connection create/delete)
- [ ] Unit tests: known paths with fixed fixture graphs

**Verification**:
```bash
# After adding test connections:
curl "http://localhost:3001/api/route?from=ZONE_A_ID&to=ZONE_B_ID"
# Returns: { path: [zoneId, ...], hops: 3 }
```

**Exit criteria**: Returns correct shortest path for a hand-crafted test graph; Redis cache is used on second call; handles disconnected graph (returns `null` path).

---

### Step 7 — Backend: WebSocket Server + Sniffer Bridge
**Branch**: `feat/ws-sniffer`
**Depends on**: Steps 4, 5
**Model tier**: default

**Context brief**: The backend needs a WebSocket server to push real-time events to the frontend (connection expired, current zone changed). It also needs to connect to the sniffer (ws://localhost:10001/ws) and translate Photon events into domain events.

**Key file references**:
- `refs/sniffer/sniffer/__main__.py` — WS server on port 10001, emits `{type:"photonEvent", data:{eventCode, parameters}}`
- Photon event codes relevant to us: zone change, player location

**Task list**:
- [ ] Add `ws` package to api; create `src/ws/server.ts` — attach WS server to Express HTTP server
- [ ] WS message types: `connection:created`, `connection:deleted`, `connection:expired`, `zone:current`, `route:updated`
- [ ] `src/ws/snifferClient.ts` — reconnecting WS client to `SNIFFER_WS_URL` (default ws://localhost:10001/ws)
- [ ] Photon event mapper: parse `eventCode` for zone change events, extract zone `UniqueName`, emit `zone:current` to frontend clients
- [ ] Frontend receives `zone:current` → highlight player's current zone on graph
- [ ] Graceful degradation: if sniffer WS is unreachable, log warning and skip (sniffer is optional)

**Verification**:
```bash
# Start sniffer: cd refs/sniffer && python -m sniffer
# Backend logs: "Sniffer connected on ws://localhost:10001/ws"
# WebSocket client: wscat -c ws://localhost:3001/ws
# Trigger zone change in game → see {type:"zone:current", zoneId:"..."} in wscat
```

**Exit criteria**: WS server accepts browser connections; sniffer bridge reconnects on disconnect; zone:current event propagates end-to-end (sniffer → backend → browser).

---

### Step 8 — Frontend: Graph Map Foundation
**Branch**: `feat/frontend-graph`
**Depends on**: Step 1
**Model tier**: default

**Context brief**: The core frontend: a Cytoscape.js graph showing zones as nodes and connections as edges. Reuse portaler-modern's Cytoscape setup patterns. Use Zustand for client state.

**Key file references**:
- `refs/portaler-modern/packages/frontend/src/` — Cytoscape component, Redux store patterns (adapt to Zustand)
- `refs/portaler-modern/packages/frontend/package.json` — Cytoscape version: 3.23.0

**Task list**:
- [ ] Install: `cytoscape`, `cytoscape-fcose`, `zustand`, `axios`, `react-query` (TanStack v5)
- [ ] `src/components/MapGraph/MapGraph.tsx` — Cytoscape container, FCose layout
- [ ] `src/components/MapGraph/graphStyles.ts` — node/edge visual styles (zone type colors, portal type edge styles)
- [ ] `src/store/mapStore.ts` — Zustand store: nodes, edges, selectedNode, currentZone, routePath
- [ ] `src/hooks/useMapData.ts` — react-query fetch of connections from api
- [ ] Cytoscape node click → select zone, show info panel placeholder
- [ ] Persist node positions to `PUT /api/layout/:zoneId` on node drag end
- [ ] Zone color scheme by type: royal=blue, black=black/gray, red=red, yellow=yellow, roads=purple

**Verification**: Open browser, see empty graph canvas with Cytoscape controls (zoom, pan).

**Exit criteria**: Graph renders; drag-and-drop nodes work; positions persist on reload.

---

### Step 9 — Frontend: Zone Management UI
**Branch**: `feat/zone-management`
**Depends on**: Steps 4, 8
**Model tier**: default

**Context brief**: Allow user to add zones to the map via typeahead search, view zone metadata on click, and remove zones. Zone info panel shows tier, resources, zone type, and city distances.

**Task list**:
- [ ] `src/components/ZoneSearch/ZoneSearch.tsx` — typeahead search calling `GET /api/zones/search`; clicking a result adds it as a node
- [ ] `src/components/ZoneInfoPanel/ZoneInfoPanel.tsx` — side panel showing zone metadata on node click:
  - Zone tier badge
  - Zone type tag (Royal/BZ/Road/etc.)
  - Resources list with icons from `/public/icons/`
  - City distances table
- [ ] Zone icon rendering on Cytoscape nodes (resource icons from avalon-roads)
- [ ] "Remove zone" button in info panel: removes node + all its connections
- [ ] Keyboard shortcut: Delete key removes selected node

**Verification**: Add "Tharcal Fissure" via search → appears as node; click it → info panel shows tier 6, resources; delete it → disappears.

**Exit criteria**: Add/view/delete zone nodes all work; zone info matches ETL-imported data.

---

### Step 10 — Frontend: Connection Management UI
**Branch**: `feat/connection-management`
**Depends on**: Steps 5, 8
**Model tier**: default

**Context brief**: Allow user to draw connections between two zone nodes. Each connection has a type (BZ portal, avalon road, etc.) and an optional duration that starts a countdown timer. Connections load on startup from the API.

**Task list**:
- [ ] Connection draw mode: click first node → click second node → open "add connection" dialog
- [ ] `src/components/AddConnectionModal/AddConnectionModal.tsx`:
  - From/To zone display
  - Connection type select (BZ_PORTAL, ROYAL_ROAD, AVALON_ROAD, TUNNEL, HIGHWAY)
  - Duration picker (hours: 1h, 2h, 22h, none/permanent)
- [ ] Edge rendering: color-coded by connection type; dashed = time-limited
- [ ] Timer countdown on edge label: `22h → 21h 43m → ...`
- [ ] Right-click edge → context menu: Edit / Delete
- [ ] Real-time: WS `connection:created` / `connection:deleted` / `connection:expired` updates graph immediately

**Verification**: Draw a BZ portal between two zones; set 22h duration; label shows countdown; after simulated expiry WS event the edge disappears.

**Exit criteria**: Full add/edit/delete connection cycle works; timer updates every minute; WS events update graph without page reload.

---

### Step 11 — Frontend: Route Optimizer UI
**Branch**: `feat/route-optimizer-ui`
**Depends on**: Steps 6, 8, 9
**Model tier**: default

**Context brief**: Allow user to select a destination zone and compute the shortest route from their current zone (or any selected zone). Highlight the route path on the graph.

**Task list**:
- [ ] `src/components/RoutePanel/RoutePanel.tsx`:
  - "From" zone selector (defaults to current zone from sniffer)
  - "To" zone typeahead search
  - "Find Route" button
  - Route result: ordered list of zone names + hop count
- [ ] On route result: highlight path edges in gold on Cytoscape graph; dim non-path nodes
- [ ] "City distance" sub-panel: show nearest major city and hop count from selected node
- [ ] Clear route button
- [ ] Handle disconnected graph (no path found → show message)

**Verification**: Add several zones + connections forming a path. Select start/end → route highlights on graph with hop count.

**Exit criteria**: Route highlights correct path; "no path" handled gracefully; city distances shown for selected zone.

---

### Step 12 — Frontend: Sniffer Integration & Current Zone Highlight
**Branch**: `feat/sniffer-ui`
**Depends on**: Steps 7, 9
**Model tier**: default

**Context brief**: Connect the frontend to the backend WebSocket and handle `zone:current` events to automatically highlight the player's current zone on the graph.

**Task list**:
- [ ] `src/hooks/useWebSocket.ts` — reconnecting WS client to `ws://localhost:3001/ws`
- [ ] Handle `zone:current` event: set `mapStore.currentZone`; scroll graph viewport to that node; apply "current" CSS class (pulsing green ring)
- [ ] Status bar component: shows sniffer connection status (connected/disconnected/no sniffer)
- [ ] When current zone is not yet on the map: show toast "Current zone not on map — add it?" with quick-add button

**Verification**: Start sniffer; change zone in game; current zone highlights on graph automatically.

**Exit criteria**: Zone highlights within 2 seconds of zone change; works without sniffer (graceful degradation).

---

### Step 13 — Hotkey & OCR Portal Tooltip Service *(post-MVP)*
**Branch**: `feat/ocr-service`
**Depends on**: Steps 5, 7
**Model tier**: default

**Context brief**: A small Python service that listens for a global hotkey (e.g., F9), captures the screen region around the mouse cursor, runs OCR on the portal tooltip, extracts the zone name and remaining duration, and pushes it to the backend via HTTP.

**Task list**:
- [ ] `packages/hotkey-service/` — Python package
- [ ] Dependencies: `pynput` (hotkey), `mss` (screen capture), `pytesseract` or `easyocr` (OCR), `httpx` (HTTP client)
- [ ] Tooltip region detection: fixed offset from mouse cursor (calibratable via config)
- [ ] OCR pipeline: capture → preprocess (threshold, scale 2x) → extract zone name + "Xh Ym remaining"
- [ ] `POST /api/connections/ocr` backend endpoint to receive OCR result and upsert connection
- [ ] Config file: `hotkey`, `capture_offset`, `backend_url`
- [ ] README: Tesseract installation instructions for Windows

**Verification**: Hover over portal tooltip in game; press hotkey; backend creates connection with correct duration.

**Exit criteria**: OCR correctly parses zone name and duration from tooltip; connection created automatically.

---

### Step 14 — Packaging & Developer Experience *(post-MVP)*
**Branch**: `feat/packaging`
**Depends on**: Steps 1–12
**Model tier**: default

**Context brief**: Make the tool easy to start. Provide a single `start.bat` for Windows users and a docker compose profile for full-stack startup.

**Task list**:
- [ ] `start.bat` — starts Docker Compose, waits for Postgres healthy, runs ETL if zones table empty, starts api + frontend, opens browser to localhost:5173
- [ ] `docker-compose.prod.yml` — profile that builds and serves frontend as static files from Express (removes Vite dependency)
- [ ] Root `README.md`: prerequisites (Docker, Node 20, Python 3.13, pnpm), quick-start steps
- [ ] Environment variable docs: complete `.env.example` with comments
- [ ] Sniffer startup instructions (how to run refs/sniffer on Windows)

**Verification**: Fresh clone → run `start.bat` → browser opens → map is usable within 2 minutes.

---

## Build Order Summary

```
Step 1 (Foundation)
    └─▶ Step 2 (Schema)
            └─▶ Step 3 (ETL) ─────────────────────────────────────────────▶ verify data
            └─▶ Step 4 (Zone API) ─────────────────────────────────────────▶ Step 9 (Zone UI)
            └─▶ Step 5 (Connections API) ─▶ Step 6 (Route Optimizer) ──────▶ Step 11 (Route UI)
                                          └─▶ Step 7 (WS + Sniffer) ────────▶ Step 12 (Sniffer UI)
    └─▶ Step 8 (Graph Foundation) ──────────────────────────────────────────▶ Steps 9, 10, 11, 12

MVP complete after Steps 1–12
Post-MVP: Steps 13 (OCR), 14 (Packaging)
```

**Parallel opportunities after Step 2 merges**: Steps 3, 4, 5, 8 have no inter-dependencies.

---

## Critical Files (to read before implementing each step)

| Step | Must read before starting |
|------|---------------------------|
| 2 | `refs/portaler-modern/packages/api-server/src/` (schema patterns) |
| 3 | `refs/ao-bin-dumps/formatted/world.json`, `refs/avalon-roads/src/data/maps.json` |
| 6 | `refs/portaler-modern/packages/frontend/src/` (graph model) |
| 7 | `refs/sniffer/sniffer/__main__.py`, `refs/sniffer/sniffer/photon/decoder.py` |
| 8 | `refs/portaler-modern/packages/frontend/src/` (Cytoscape component) |
| 13 | `refs/sniffer/README.md` (platform docs for hotkey approach) |

---

## Technology Decisions

| Concern | Choice | Reason |
|---------|--------|--------|
| Frontend state | Zustand | Simpler than Redux; portaler-modern used Redux but we don't need middleware |
| Backend ORM | `pg` + raw SQL (knex for migrations) | portaler-modern pattern; no ORM overhead |
| Graph viz | Cytoscape.js 3.23 + fcose | Directly from portaler-modern; battle-tested for this exact use case |
| HTTP client | TanStack Query v5 | Caching, refetch, optimistic updates built-in |
| Real-time | Native WebSocket (ws package) | No Socket.IO needed for local single-user tool |
| Route algorithm | Dijkstra with in-memory adjacency list | Simple, fast enough for <2000 nodes |
| ETL style | One-shot script (not migrations) | Game data doesn't change often; re-run manually on patch day |

---

## Verification: End-to-End Test (MVP Complete)

1. Run `docker compose up -d` → Postgres + Redis healthy
2. Run `pnpm --filter @ao-mapper/etl load` → 800+ zones in DB
3. Run `pnpm dev` → frontend on :5173, api on :3001
4. Open browser → blank graph canvas visible
5. Search "Tharcal Fissure" → add as node → info panel shows T6, zone type, resources
6. Search a second zone → add it → draw BZ portal connection with 22h timer
7. Click "Find Route" between the two zones → path highlights on graph
8. Start `refs/sniffer` Python process → enter a zone in game → graph highlights current zone automatically
9. Timer countdown visible on connection edge; after expiry → edge auto-removed

---

## Out of Scope (Intentionally)

- Multi-user / guild data sharing
- Authentication
- Discord bot
- Mobile support
- Cloud hosting / deployment
- Localization (English-only UI)
