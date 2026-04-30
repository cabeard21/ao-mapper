import type {
  CityDistance,
  Connection,
  RouteConnectionSource,
  RouteDirection,
  RouteResult,
  RouteStep,
  Zone,
} from "@ao-mapper/shared";

type Point = [number, number];

export interface RouteEdge {
  fromZoneId: string;
  toZoneId: string;
  weight?: number;
  fromPosition?: Point;
  toPosition?: Point;
}

export interface RouteCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  deleteByPrefix(prefix: string): Promise<void>;
}

export interface RouteOptimizerDataSource {
  findActiveConnections: () => Promise<Connection[]>;
  findStaticEdges?: () => Promise<RouteEdge[]>;
  findZoneById: (id: string) => Promise<Zone | null>;
  cache?: RouteCache;
}

type RouteGraph = Map<string, GraphEdge[]>;

interface GraphEdge {
  fromZoneId: string;
  toZoneId: string;
  weight: number;
  source: RouteConnectionSource;
  fromPosition?: Point;
  toPosition?: Point;
}

interface PathResult {
  path: string[] | null;
  hops: number | null;
  cost: number | null;
  edges: GraphEdge[];
}

interface AfmPortalEdge {
  targetLocationId?: string;
  position?: Point;
}

interface AfmMetadata {
  id?: string;
  minimapBoundsMin?: Point;
  minimapBoundsMax?: Point;
  exits?: AfmPortalEdge[];
  portalEntrances?: AfmPortalEdge[];
  portalExits?: AfmPortalEdge[];
}

const routeCacheKey = (fromZoneId: string, toZoneId: string): string =>
  `route:v2:${fromZoneId}:${toZoneId}`;

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function afmMetadata(zone: Zone): AfmMetadata | null {
  const value = zone.metadata.afm;
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const metadata = value as AfmMetadata;
  return typeof metadata.id === "string" ? metadata : null;
}

function afmEdges(metadata: AfmMetadata | null): AfmPortalEdge[] {
  if (!metadata) {
    return [];
  }
  return [
    ...(Array.isArray(metadata.exits) ? metadata.exits : []),
    ...(Array.isArray(metadata.portalEntrances) ? metadata.portalEntrances : []),
    ...(Array.isArray(metadata.portalExits) ? metadata.portalExits : []),
  ].filter((edge) => isPoint(edge.position));
}

function edgeWeight(weight: number | undefined): number {
  return weight && Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function addUndirectedEdge(graph: RouteGraph, edge: GraphEdge): void {
  graph.set(edge.fromZoneId, [...(graph.get(edge.fromZoneId) ?? []), edge]);
  graph.set(edge.toZoneId, [
    ...(graph.get(edge.toZoneId) ?? []),
    {
      ...edge,
      fromZoneId: edge.toZoneId,
      toZoneId: edge.fromZoneId,
      fromPosition: edge.toPosition,
      toPosition: edge.fromPosition,
    },
  ]);
}

function buildGraph(connections: Connection[], staticEdges: RouteEdge[]): RouteGraph {
  const graph: RouteGraph = new Map();
  for (const connection of connections) {
    addUndirectedEdge(graph, {
      fromZoneId: connection.fromZoneId,
      toZoneId: connection.toZoneId,
      weight: 1,
      source: "active",
    });
  }
  for (const edge of staticEdges) {
    addUndirectedEdge(graph, {
      fromZoneId: edge.fromZoneId,
      toZoneId: edge.toZoneId,
      weight: edgeWeight(edge.weight),
      source: "static",
      fromPosition: edge.fromPosition,
      toPosition: edge.toPosition,
    });
  }
  return graph;
}

function isCurrentRouteResult(value: RouteResult): boolean {
  return "cost" in value && Array.isArray(value.steps);
}

function shortestPath(graph: RouteGraph, from: string, to: string): PathResult {
  if (from === to) {
    return { path: [from], hops: 0, cost: 0, edges: [] };
  }

  const distances = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, GraphEdge>();
  const visited = new Set<string>();

  while (true) {
    let current: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const [zoneId, distance] of distances) {
      if (!visited.has(zoneId) && distance < currentDistance) {
        current = zoneId;
        currentDistance = distance;
      }
    }
    if (!current) {
      break;
    }
    if (current === to) {
      break;
    }

    visited.add(current);
    const neighbors = graph.get(current) ?? [];

    for (const edge of neighbors) {
      const nextDistance = currentDistance + edge.weight;
      if (nextDistance < (distances.get(edge.toZoneId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.toZoneId, nextDistance);
        previous.set(edge.toZoneId, edge);
      }
    }
  }

  const cost = distances.get(to);
  if (cost === undefined) {
    return { path: null, hops: null, cost: null, edges: [] };
  }

  const path = [to];
  const edges: GraphEdge[] = [];
  let cursor = to;
  while (previous.has(cursor)) {
    const edge = previous.get(cursor) as GraphEdge;
    edges.unshift(edge);
    cursor = edge.fromZoneId;
    path.unshift(cursor);
  }

  return { path, hops: path.length - 1, cost, edges };
}

function directionFromPosition(zone: Zone, position: Point | undefined): RouteDirection | null {
  if (zone.zoneType === "roads" || !position) {
    return null;
  }

  const metadata = afmMetadata(zone);
  if (!metadata || !isPoint(metadata.minimapBoundsMin) || !isPoint(metadata.minimapBoundsMax)) {
    return null;
  }

  const centerX = (metadata.minimapBoundsMin[0] + metadata.minimapBoundsMax[0]) / 2;
  const centerY = (metadata.minimapBoundsMin[1] + metadata.minimapBoundsMax[1]) / 2;
  const northSouth = position[1] < centerY ? "N" : "S";
  const westEast = position[0] < centerX ? "W" : "E";
  return `${northSouth}${westEast}` as RouteDirection;
}

function afmPositionForNeighbor(zone: Zone, neighbor: Zone): Point | undefined {
  const zoneAfm = afmMetadata(zone);
  const neighborAfm = afmMetadata(neighbor);
  if (!zoneAfm?.id || !neighborAfm?.id) {
    return undefined;
  }
  return afmEdges(zoneAfm).find(
    (edge) => edge.targetLocationId === neighborAfm.id && isPoint(edge.position)
  )?.position;
}

function edgePositionForZone(
  edge: GraphEdge | undefined,
  zoneId: string,
  zone: Zone,
  neighbor: Zone | undefined
): Point | undefined {
  if (!edge) {
    return undefined;
  }
  if (edge.fromZoneId === zoneId) {
    return edge.fromPosition ?? (neighbor ? afmPositionForNeighbor(zone, neighbor) : undefined);
  }
  if (edge.toZoneId === zoneId) {
    return edge.toPosition ?? (neighbor ? afmPositionForNeighbor(zone, neighbor) : undefined);
  }
  return undefined;
}

async function buildSteps(
  dataSource: RouteOptimizerDataSource,
  path: string[],
  edges: GraphEdge[]
): Promise<RouteStep[]> {
  const zones = await Promise.all(path.map((zoneId) => dataSource.findZoneById(zoneId)));
  if (zones.some((zone) => zone === null)) {
    return [];
  }

  return path.map((zoneId, index) => {
    const zone = zones[index] as Zone;
    const previousEdge = edges[index - 1];
    const nextEdge = edges[index];
    const previousZone = index > 0 ? (zones[index - 1] as Zone) : undefined;
    const nextZone = index < zones.length - 1 ? (zones[index + 1] as Zone) : undefined;

    return {
      zone,
      enterDirection: directionFromPosition(
        zone,
        edgePositionForZone(previousEdge, zoneId, zone, previousZone)
      ),
      exitDirection: directionFromPosition(
        zone,
        edgePositionForZone(nextEdge, zoneId, zone, nextZone)
      ),
      sourceFromPrevious: previousEdge?.source ?? null,
      sourceToNext: nextEdge?.source ?? null,
    };
  });
}

export class RouteOptimizer {
  constructor(private readonly dataSource: RouteOptimizerDataSource) {}

  async findRoute(fromZoneId: string, toZoneId: string): Promise<RouteResult> {
    const cacheKey = routeCacheKey(fromZoneId, toZoneId);
    const cached = await this.dataSource.cache?.get<RouteResult>(cacheKey);
    if (cached && isCurrentRouteResult(cached)) {
      return cached;
    }

    const [connections, staticEdges] = await Promise.all([
      this.dataSource.findActiveConnections(),
      this.dataSource.findStaticEdges?.() ?? Promise.resolve([]),
    ]);
    const pathResult = shortestPath(buildGraph(connections, staticEdges), fromZoneId, toZoneId);
    const result: RouteResult = pathResult.path
      ? {
          path: pathResult.path,
          hops: pathResult.hops,
          cost: pathResult.cost,
          steps: await buildSteps(this.dataSource, pathResult.path, pathResult.edges),
        }
      : { path: null, hops: null, cost: null, steps: [] };

    await this.dataSource.cache?.set(cacheKey, result);
    return result;
  }

  async findCityDistances(zoneId: string): Promise<CityDistance[]> {
    const zone = await this.dataSource.findZoneById(zoneId);
    return [...(zone?.cityDistances ?? [])].sort((a, b) => a.hops - b.hops);
  }

  async invalidateRoutes(): Promise<void> {
    await this.dataSource.cache?.deleteByPrefix("route:");
  }
}
