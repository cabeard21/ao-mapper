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
  directed?: boolean;
  positionsMathY?: boolean;
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
  activeConnectionId?: string;
  fromPosition?: Point;
  toPosition?: Point;
  directed?: boolean;
  positionsMathY?: boolean;
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
  worldmapposition?: Point | null;
  exits?: AfmPortalEdge[];
  portalEntrances?: AfmPortalEdge[];
  portalExits?: AfmPortalEdge[];
}

const routeCacheKey = (fromZoneId: string, toZoneId: string): string =>
  `route:v8:${fromZoneId}:${toZoneId}`;

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
      activeConnectionId: connection.id,
    });
  }
  for (const edge of staticEdges) {
    const graphEdge: GraphEdge = {
      fromZoneId: edge.fromZoneId,
      toZoneId: edge.toZoneId,
      weight: edgeWeight(edge.weight),
      source: "static",
      fromPosition: edge.fromPosition,
      toPosition: edge.toPosition,
      directed: edge.directed,
      positionsMathY: edge.positionsMathY,
    };
    if (edge.directed) {
      graph.set(edge.fromZoneId, [...(graph.get(edge.fromZoneId) ?? []), graphEdge]);
    } else {
      addUndirectedEdge(graph, graphEdge);
    }
  }
  return graph;
}

function isCurrentRouteResult(value: RouteResult): boolean {
  return "cost" in value && Array.isArray(value.steps);
}

function pointKey(position: Point | undefined): string {
  return position ? `${position[0]},${position[1]}` : "unknown";
}

function stateKey(zoneId: string, entryPosition: Point | undefined): string {
  return `${zoneId}|${pointKey(entryPosition)}`;
}

function distanceBetween(a: Point, b: Point): number {
  return Math.max(1, Math.round(Math.hypot(a[0] - b[0], a[1] - b[1])));
}

function staticTransitionCost(edge: GraphEdge, entryPosition: Point | undefined): number {
  if (edge.source !== "static" || !entryPosition || !edge.fromPosition) {
    return edge.weight;
  }
  return distanceBetween(entryPosition, edge.fromPosition);
}

function isImmediateActiveEdgeReversal(
  previousEdge: GraphEdge | undefined,
  nextEdge: GraphEdge
): boolean {
  return (
    previousEdge?.source === "active" &&
    nextEdge.source === "active" &&
    previousEdge.activeConnectionId !== undefined &&
    previousEdge.activeConnectionId === nextEdge.activeConnectionId &&
    previousEdge.fromZoneId === nextEdge.toZoneId &&
    previousEdge.toZoneId === nextEdge.fromZoneId
  );
}

function shortestPath(graph: RouteGraph, from: string, to: string): PathResult {
  if (from === to) {
    return { path: [from], hops: 0, cost: 0, edges: [] };
  }

  const startKey = stateKey(from, undefined);
  const distances = new Map<string, number>([[startKey, 0]]);
  const states = new Map<string, { zoneId: string; entryPosition?: Point }>([
    [startKey, { zoneId: from }],
  ]);
  const previous = new Map<string, { previousKey: string; edge: GraphEdge }>();
  const visited = new Set<string>();
  const settledZones = new Set<string>();

  while (true) {
    let currentKey: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const [key, distance] of distances) {
      if (!visited.has(key) && distance < currentDistance) {
        currentKey = key;
        currentDistance = distance;
      }
    }
    if (!currentKey) {
      break;
    }
    const current = states.get(currentKey);
    if (!current) {
      break;
    }
    if (current.zoneId === to) {
      break;
    }

    visited.add(currentKey);

    // Each zone is expanded at most once. Without this, the optimizer can re-enter
    // the same zone via a different static edge to obtain a cheaper entry position
    // for onward travel, producing paths that visit the same zone twice (U-turns).
    if (settledZones.has(current.zoneId)) {
      continue;
    }
    settledZones.add(current.zoneId);

    const neighbors = graph.get(current.zoneId) ?? [];
    const previousEdge = previous.get(currentKey)?.edge;

    for (const edge of neighbors) {
      if (isImmediateActiveEdgeReversal(previousEdge, edge)) {
        continue;
      }
      const nextEntryPosition = edge.source === "static" ? edge.toPosition : undefined;
      const nextKey = stateKey(edge.toZoneId, nextEntryPosition);
      const nextDistance = currentDistance + staticTransitionCost(edge, current.entryPosition);
      if (nextDistance < (distances.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        distances.set(nextKey, nextDistance);
        states.set(nextKey, { zoneId: edge.toZoneId, entryPosition: nextEntryPosition });
        previous.set(nextKey, { previousKey: currentKey, edge });
      }
    }
  }

  let bestKey: string | null = null;
  let cost = Number.POSITIVE_INFINITY;
  for (const [key, distance] of distances) {
    if (states.get(key)?.zoneId === to && distance < cost) {
      bestKey = key;
      cost = distance;
    }
  }
  if (!bestKey || !Number.isFinite(cost)) {
    return { path: null, hops: null, cost: null, edges: [] };
  }

  const path = [to];
  const edges: GraphEdge[] = [];
  let cursor = bestKey;
  while (previous.has(cursor)) {
    const { previousKey, edge } = previous.get(cursor) as {
      previousKey: string;
      edge: GraphEdge;
    };
    edges.unshift(edge);
    cursor = previousKey;
    path.unshift(states.get(cursor)?.zoneId ?? edge.fromZoneId);
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

function worldMapPosition(zone: Zone): Point | undefined {
  const position = afmMetadata(zone)?.worldmapposition;
  return isPoint(position) ? position : undefined;
}

function travelDirectionBetweenZones(zone: Zone, neighbor: Zone | undefined): RouteDirection | null {
  if (zone.zoneType === "roads" || !neighbor) {
    return null;
  }

  const currentPosition = worldMapPosition(zone);
  const neighborPosition = worldMapPosition(neighbor);
  if (!currentPosition || !neighborPosition) {
    return null;
  }

  const deltaX = neighborPosition[0] - currentPosition[0];
  const deltaY = neighborPosition[1] - currentPosition[1];
  if (deltaX === 0 && deltaY === 0) {
    return null;
  }

  const northSouth = deltaY < 0 ? "S" : "N";
  const westEast = deltaX < 0 ? "W" : "E";
  return `${northSouth}${westEast}` as RouteDirection;
}

function afmPositionForNeighbor(zone: Zone, neighbor: Zone): Point | undefined {
  const zoneAfm = afmMetadata(zone);
  const neighborAfm = afmMetadata(neighbor);
  if (!zoneAfm?.id || !neighborAfm?.id) {
    return undefined;
  }
  const position = afmEdges(zoneAfm).find(
    (edge) => edge.targetLocationId === neighborAfm.id && isPoint(edge.position)
  )?.position;
  // AFM positions use math Y-up; negate to match screen-Y expected by directionFromPosition
  return position ? [position[0], -position[1]] : undefined;
}

function flipMathY(pos: Point): Point {
  return [pos[0], -pos[1]];
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
    // fromPosition is set: use it, flipping Y if the edge stores math-Y coordinates
    if (edge.fromPosition) {
      return edge.positionsMathY ? flipMathY(edge.fromPosition) : edge.fromPosition;
    }
    // Fallback: afmPositionForNeighbor already returns screen-Y (flipped internally)
    return neighbor ? afmPositionForNeighbor(zone, neighbor) : undefined;
  }
  if (edge.toZoneId === zoneId) {
    return edge.toPosition && edge.positionsMathY ? flipMathY(edge.toPosition) : edge.toPosition;
  }
  return undefined;
}

function routeDirectionForStep(
  zone: Zone,
  edge: GraphEdge | undefined,
  zoneId: string,
  neighbor: Zone | undefined
): RouteDirection | null {
  return (
    directionFromPosition(zone, edgePositionForZone(edge, zoneId, zone, neighbor)) ??
    travelDirectionBetweenZones(zone, neighbor)
  );
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
      enterDirection: routeDirectionForStep(zone, previousEdge, zoneId, previousZone),
      exitDirection: routeDirectionForStep(zone, nextEdge, zoneId, nextZone),
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

    if (result.path !== null) {
      await this.dataSource.cache?.set(cacheKey, result);
    }
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
