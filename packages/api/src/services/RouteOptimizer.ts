import type { CityDistance, Connection, Zone } from "@ao-mapper/shared";

export interface RouteResult {
  path: string[] | null;
  hops: number | null;
}

export interface RouteEdge {
  fromZoneId: string;
  toZoneId: string;
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

type AdjacencyList = Map<string, string[]>;

const routeCacheKey = (fromZoneId: string, toZoneId: string): string =>
  `route:${fromZoneId}:${toZoneId}`;

function addUndirectedEdge(graph: AdjacencyList, from: string, to: string): void {
  const fromEdges = graph.get(from) ?? [];
  const toEdges = graph.get(to) ?? [];
  graph.set(from, fromEdges.includes(to) ? fromEdges : [...fromEdges, to]);
  graph.set(to, toEdges.includes(from) ? toEdges : [...toEdges, from]);
}

function buildGraph(connections: Connection[]): AdjacencyList {
  const graph: AdjacencyList = new Map();
  for (const connection of connections) {
    addUndirectedEdge(graph, connection.fromZoneId, connection.toZoneId);
  }
  return graph;
}

function addStaticEdges(graph: AdjacencyList, edges: RouteEdge[]): AdjacencyList {
  for (const edge of edges) {
    addUndirectedEdge(graph, edge.fromZoneId, edge.toZoneId);
  }
  return graph;
}

function shortestPath(graph: AdjacencyList, from: string, to: string): RouteResult {
  if (from === to) {
    return { path: [from], hops: 0 };
  }

  const queue: string[] = [from];
  const visited = new Set<string>([from]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const neighbors = graph.get(current) ?? [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      previous.set(neighbor, current);

      if (neighbor === to) {
        const path = [to];
        let cursor = to;
        while (previous.has(cursor)) {
          cursor = previous.get(cursor) as string;
          path.unshift(cursor);
        }
        return { path, hops: path.length - 1 };
      }

      queue.push(neighbor);
    }
  }

  return { path: null, hops: null };
}

export class RouteOptimizer {
  constructor(private readonly dataSource: RouteOptimizerDataSource) {}

  async findRoute(fromZoneId: string, toZoneId: string): Promise<RouteResult> {
    const cacheKey = routeCacheKey(fromZoneId, toZoneId);
    const cached = await this.dataSource.cache?.get<RouteResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const [connections, staticEdges] = await Promise.all([
      this.dataSource.findActiveConnections(),
      this.dataSource.findStaticEdges?.() ?? Promise.resolve([]),
    ]);
    const result = shortestPath(
      addStaticEdges(buildGraph(connections), staticEdges),
      fromZoneId,
      toZoneId
    );

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
