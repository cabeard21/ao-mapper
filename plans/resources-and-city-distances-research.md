# Research: Resources & City Distances in ao-mapper

## What the UI expects

`ZoneInfoPanel` displays:
- `zone.resources` — array of `{type, tier}` from `packages/shared/src/types/zone.ts`
- `zone.cityDistances` — array of `{cityName, hops}` from the same type file

Both fields come from the `zones` DB table columns `resources JSONB` and `city_distance JSONB`, default `[]`.

---

## Resources

### Data sources investigated

| File | Size | What it contains |
|------|------|-----------------|
| `refs/avalon-roads/src/data/maps.json` | 193 KB | 316 Roads of Avalon zones with resource/chest/dungeon data |
| `refs/ao-bin-dumps/resources.json` | 799 KB | Resource type definitions and tier progression — NOT per-zone |
| `refs/ao-bin-dumps/resourcedistpresets.json` | 1.1 MB | Resource distribution presets — NOT per-zone locations |
| `refs/ao-bin-dumps/cluster/*.cluster.xml` | varies | Visual/structural layout only — NO resource nodes, NO connections |
| `refs/ao-bin-dumps/worldsettings.json` | 545 KB | Zone archetype PvP rules — NOT resource locations |

### What maps.json actually covers

`maps.json` is from the [avalon-roads](https://github.com/broderickhyman/albiondata-client) community project. Its zone names use the Roads of Avalon naming convention: `Cases-Ugumlos`, `Casitos-Alieam`, etc.

These names correspond to **text-index** entries in `world.json` (where `Index` = display name, e.g. `Index="Cases-Ugumlos"`). The normalization join in `importZones.ts` works correctly for these:
- `normalizeName("Cases-Ugumlos")` → `"cases-ugumlos"`
- maps.json key `normalizeName("Cases-Ugumlos")` → `"cases-ugumlos"` ✓ match

### What is NOT covered

**Outland zones** (454 numeric-index entries in world.json) have display names like "Swamp Cross", "Tharcal Fissure", "Drybasin Oasis". None of these appear in maps.json. No other static reference file contains per-zone resource data for them.

**Conclusion**: Resources will be populated for Roads of Avalon zones after ETL, and will be empty for all outland/world zones. This is a data gap, not a code bug.

---

## City Distances

### Update: Albion Free Market exposes a usable static graph

The earlier conclusion below is accurate for the local `refs/ao-bin-dumps`
files, but Albion Free Market has built and published its own derived map
dataset:

- `https://cdn.albionfreemarket.com/AlbionWorld/albionLocations.json`
- `https://cdn.albionfreemarket.com/AlbionWorld/map/images/{imageFile}.webp`
- `https://cdn.albionfreemarket.com/AlbionWorld/map/maps/{z}/map_{x}_{y}.webp`

Direct inspection on 2026-04-29 found:

- `albionLocations.json` is about 1.99 MB and contains 1,330 locations.
- Each location includes `id`, `displayName`, `tier`, `biome`,
  `pvpCategory`, `mapCategory`, `imageFile`, `worldmapposition`,
  `minimapBoundsMin`, `minimapBoundsMax`, `neighbours`, `exits`,
  `portalEntrances`, and `portalExits`.
- `exits`, `portalEntrances`, and `portalExits` include local map
  coordinates and target location IDs. Example fields:
  `id`, `targetId`, `targetLocationId`, `position`, and sometimes `kind`.
- Zone images are addressable by replacing `.png` with `.webp` in
  `imageFile` and loading from `/AlbionWorld/map/images/`.
- The world overview is rendered from tiled WebP files under
  `/AlbionWorld/map/maps/{z}/map_{x}_{y}.webp`.

AFM's client-side pathfinder loads this JSON, builds a cluster map by `id`,
and searches across `exits + portalEntrances + portalExits`. The route cost
for a transition is the Euclidean distance from the current entry coordinate
to the selected exit coordinate inside the current map:

```ts
sqrt((entry.x - exit.x) ** 2 + (entry.y - exit.y) ** 2)
```

That distance is multiplied by user-configurable PvP category and map category
weights. Maps-to-avoid are not removed from the graph; AFM multiplies their
cost heavily. This is effectively Dijkstra over a state key of:

```ts
clusterId + "|" + entry.x + "," + entry.y
```

The output path tracks, for each cluster, the entry coordinate, exit
coordinate, intra-map distance, previous cluster, and next cluster. The trip
summary then adds optional local marker-to-marker distances inside a map.

### Recommendation for ao-mapper

Use AFM's public CDN dataset as an optional static-distance source, with a
local vendored/cache copy for reproducibility. This would let ao-mapper
compute both:

- hop count to cities, using `neighbours`/exit targets as unweighted edges
- approximate travel distance to cities, using per-exit local coordinates as
  weighted edges

Recommended shape:

1. Add a small ETL input for `albionLocations.json`.
2. Join AFM `id`/`displayName` to our `zones` table by `displayName`, with
   explicit handling for duplicate city/market/smuggler variants.
3. Store AFM map metadata in `zones.metadata.afm`, including `afmId`,
   `imageFile`, `mapCategory`, `pvpCategory`, `worldMapPosition`,
   `minimapBounds`, and raw exits.
4. Build a static weighted edge table from `exits`, `portalEntrances`, and
   `portalExits`, resolving `targetLocationId` to our zone IDs.
5. Extend `city_distance` from `{cityName, hops}` to either add
   `meters?: number` while keeping `hops`, or create a new
   `city_travel_distance JSONB` column if API compatibility matters.
6. Use Dijkstra for weighted city distances. Keep current BFS only for hop
   count.

Important caveat: AFM's dataset is derived/public web data, not an official
Sandbox Interactive API. Cache/version the file instead of making the app
depend on their CDN at runtime.

### Cities identified in world.json

| world.json Index | unique_name in DB |
|-----------------|-------------------|
| 0000 | Thetford |
| 1000 | Lymhurst |
| 2000 | Bridgewatch |
| 3003 | Caerleon |
| 3004 | Martlock |
| 4000 | Fort Sterling |
| 5000 | Brecilien |

### Superseded local-file conclusion

No static zone adjacency graph exists in the local ref files originally
checked. The cluster XML files contain template references for visual layout
(exits, portals) but **no logical zone-to-zone links**.

Connections are runtime/user-entered data in the `connections` table:
```sql
from_zone_id UUID -- references zones
to_zone_id   UUID -- references zones
conn_type    TEXT -- BZ_PORTAL, ROYAL_ROAD, AVALON_ROAD, TUNNEL, HIGHWAY
expires_at   TIMESTAMPTZ -- nullable, for temporary portals
```

At ETL time there are no user-entered connections in the DB, so BFS over only
the `connections` table has nothing to traverse. This is no longer a blocker
if we import AFM's static location graph.

### Original runtime-only implementation

City distances should be computed at the **API layer** via BFS over the current connection graph:

1. Query all zones and active (non-expired) connections from DB
2. Build bidirectional adjacency map `Map<zoneId, zoneId[]>`
3. Identify city zone IDs by `display_name` matching the 7 cities above
4. Run BFS from each city, record `{cityName, hops}` per reachable zone
5. Bulk-update `city_distance` column

Trigger options:
- **Manual**: `POST /api/zones/recompute-distances` — user calls after mapping connections
- **Automatic**: call recompute in the WebSocket handler after `connection:created` / `connection:deleted` events

### Key implementation note

The `city_distance` column is already `JSONB NOT NULL DEFAULT '[]'` in the schema, so no migration is needed.
