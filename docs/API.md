# API Reference

Base URL: `http://localhost:3001`

All responses use the envelope from `@ao-mapper/shared`:

```ts
{ success: boolean, data: T | null, error: string | null }
// Paginated variant adds: meta: { total, page, limit }
```

---

<!-- AUTO-GENERATED: routes -->
## Health

### `GET /health`

Returns server uptime.

```json
{ "status": "ok", "uptime": 42.3 }
```

---

## Zones

### `GET /api/zones`

List zones with optional filtering.

| Query param | Type | Description |
|-------------|------|-------------|
| `q` | string | Free-text search on display/unique name |
| `tier` | 1–8 | Filter by zone tier |
| `type` | enum | `royal` \| `black` \| `red` \| `yellow` \| `blue` \| `roads` \| `unknown` |
| `limit` | int (1–100) | Page size (default 50) |
| `offset` | int | Pagination offset (default 0) |

Returns `PaginatedResponse<Zone>`.

### `GET /api/zones/search?q=<query>`

Fast name search. `q` must be at least 2 characters. Returns `ApiResponse<Zone[]>`.

### `GET /api/zones/:id`

Fetch a single zone by UUID. Returns `ApiResponse<Zone>` or 404.

---

## Connections

### `GET /api/connections`

List all active (non-expired) portal connections. Returns `ApiResponse<Connection[]>`.

### `GET /api/connections/expired`

List expired portal connections. Returns `ApiResponse<Connection[]>`.

### `POST /api/connections`

Create a portal connection.

```json
{
  "fromZoneId": "uuid",
  "toZoneId": "uuid",
  "connType": "PORTAL_7" | "PORTAL_20",
  "durationHours": 7.0
}
```

Returns `ApiResponse<Connection>` with status 201. Broadcasts `connection:created` and `route:updated` WebSocket events.

### `PATCH /api/connections/:id`

Update an existing connection.

```json
{
  "connType": "PORTAL_7" | "PORTAL_20",
  "durationHours": 20.0
}
```

All fields optional. Returns `ApiResponse<Connection>`. Broadcasts `connection:updated` and `route:updated`.

### `DELETE /api/connections/:id`

Delete a connection. Returns 204 on success. Broadcasts `connection:deleted` and `route:updated`.

---

## Route

### `GET /api/route?from=<uuid>&to=<uuid>`

Find the optimal route between two zones (uses both active portal connections and static road data).

Returns `ApiResponse<RouteResult>`:

```ts
interface RouteResult {
  path: string[] | null;   // zone IDs in order
  hops: number | null;
  cost: number | null;
  steps: RouteStep[];      // enriched with direction and connection source
}
```

### `GET /api/route/to-city?from=<uuid>`

Find distances from a zone to all major cities. Returns `ApiResponse<CityDistance[]>`:

```ts
interface CityDistance {
  cityName: string;
  hops: number;
  meters?: number;
}
```

---

## Layout

### `GET /api/layout`

Get all saved node positions. Returns `ApiResponse<LayoutEntry[]>`.

### `GET /api/layout/nodes`

Get all layout nodes. Returns `ApiResponse<LayoutNode[]>`.

### `PUT /api/layout/:zoneId`

Upsert a node position.

```json
{ "x": 100.0, "y": 200.0 }
```

Returns `{ success: true }`.

### `DELETE /api/layout/:zoneId`

Remove a saved node position. Returns 204.

---

## WebSocket

Connect to `ws://localhost:3001` for real-time events.

| Event type | Payload |
|------------|---------|
| `connection:created` | `{ type, connection: Connection }` |
| `connection:updated` | `{ type, connection: Connection }` |
| `connection:deleted` | `{ type, connectionId: string }` |
| `connection:expired` | `{ type, connectionIds: string[] }` |
| `zone:current` | `{ type, zoneId: string }` (from sniffer) |
| `route:updated` | `{ type }` (graph invalidated) |
<!-- END AUTO-GENERATED -->
