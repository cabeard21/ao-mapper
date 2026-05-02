import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import type { RouteEdge } from "../services/RouteOptimizer";

interface WorldJson {
  world?: {
    clusters?: {
      cluster?: ClusterEntry[] | ClusterEntry;
    };
  };
}

interface ClusterEntry {
  "@id"?: string;
  "@displayname"?: string;
  exits?: {
    exit?: ExitEntry[] | ExitEntry;
  };
}

interface ExitEntry {
  "@id"?: string;
  "@targetid"?: string;
  "@targettype"?: string;
  "@pos"?: string;
}

interface ZoneIdRow {
  id: string;
  unique_name: string;
  display_name: string;
}

type Point = [number, number];

interface ClusterEdge {
  fromClusterId: string;
  toClusterId: string;
  fromLookupKey: string;
  toLookupKey: string;
  toExitId?: string;
  fromPosition?: Point;
}

const defaultWorldJsonCandidates = () => [
  path.resolve(process.cwd(), "refs/ao-bin-dumps/cluster/world.json"),
  path.resolve(process.cwd(), "../../refs/ao-bin-dumps/cluster/world.json"),
];

function arrayOf<T>(value: T[] | T | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function targetClusterId(targetId: string | undefined): string | null {
  if (!targetId || !targetId.includes("@")) {
    return null;
  }
  const [, clusterId] = targetId.split("@");
  return clusterId && clusterId !== "00000000-0000-0000-0000-000000000000"
    ? clusterId
    : null;
}

function targetExitId(targetId: string | undefined): string | undefined {
  if (!targetId || !targetId.includes("@")) {
    return undefined;
  }
  const [exitId] = targetId.split("@");
  return exitId || undefined;
}

function parsePoint(value: string | undefined): Point | undefined {
  if (!value) {
    return undefined;
  }
  const [x, y] = value.split(/\s+/).map((part) => Number(part));
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
}

function readWorldJson(candidates: string[]): WorldJson | null {
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as WorldJson;
}

function distanceBetween(a: Point, b: Point): number {
  return Math.max(1, Math.round(Math.hypot(a[0] - b[0], a[1] - b[1])));
}

function minExitDistance(entry: Point | undefined, exits: Point[]): number | undefined {
  if (!entry || exits.length === 0) return undefined;
  let min = Number.POSITIVE_INFINITY;
  for (const exit of exits) {
    const d = distanceBetween(entry, exit);
    if (d < min) min = d;
  }
  return min === Number.POSITIVE_INFINITY ? undefined : min;
}

function extractClusterEdges(worldJson: WorldJson): RouteEdge[] {
  const clusterEdges: ClusterEdge[] = [];
  const positionByClusterAndExit = new Map<string, Point>();
  const exitPositionsByCluster = new Map<string, Point[]>();
  const displayNameByClusterId = new Map<string, string>();
  const displayNameCounts = new Map<string, number>();
  const clusters = arrayOf(worldJson.world?.clusters?.cluster);

  for (const cluster of clusters) {
    const clusterId = cluster["@id"];
    if (clusterId) {
      const displayName = cluster["@displayname"] ?? clusterId;
      displayNameByClusterId.set(clusterId, displayName);
      displayNameCounts.set(displayName, (displayNameCounts.get(displayName) ?? 0) + 1);
    }
  }

  for (const cluster of clusters) {
    const fromClusterId = cluster["@id"];
    if (!fromClusterId) {
      continue;
    }

    for (const exit of arrayOf(cluster.exits?.exit)) {
      if (exit["@id"]) {
        const position = parsePoint(exit["@pos"]);
        if (position) {
          positionByClusterAndExit.set(`${fromClusterId}:${exit["@id"]}`, position);
          exitPositionsByCluster.set(fromClusterId, [
            ...(exitPositionsByCluster.get(fromClusterId) ?? []),
            position,
          ]);
        }
      }

      if (exit["@targettype"] !== "Cluster") {
        continue;
      }

      const toClusterId = targetClusterId(exit["@targetid"]);
      if (toClusterId) {
        const fromDisplayName = displayNameByClusterId.get(fromClusterId) ?? fromClusterId;
        const toDisplayName = displayNameByClusterId.get(toClusterId) ?? toClusterId;
        clusterEdges.push({
          fromClusterId,
          toClusterId,
          fromLookupKey:
            (displayNameCounts.get(fromDisplayName) ?? 0) > 1
              ? fromClusterId
              : fromDisplayName,
          toLookupKey:
            (displayNameCounts.get(toDisplayName) ?? 0) > 1
              ? toClusterId
              : toDisplayName,
          toExitId: targetExitId(exit["@targetid"]),
          fromPosition: parsePoint(exit["@pos"]),
        });
      }
    }
  }

  // World.json lists exits from both sides of each connection, so we return one
  // directed edge per cluster exit. The reverse direction comes from the other
  // cluster's own exit entry, giving each direction its own correct weight.
  return clusterEdges.map((edge) => {
    const toPosition = edge.toExitId
      ? positionByClusterAndExit.get(`${edge.toClusterId}:${edge.toExitId}`)
      : undefined;
    // Weight = minimum in-zone traversal distance in the destination cluster:
    // from the entry point (toPosition) to the nearest other exit. Both
    // coordinates are in the destination cluster's local space. The entry exit
    // itself is excluded so we measure traversal to a different exit, not
    // a U-turn back to where we came from.
    const allDestExits = exitPositionsByCluster.get(edge.toClusterId) ?? [];
    const destExits = toPosition
      ? allDestExits.filter((p) => !(p[0] === toPosition[0] && p[1] === toPosition[1]))
      : allDestExits;
    return {
      fromZoneId: edge.fromLookupKey,
      toZoneId: edge.toLookupKey,
      fromPosition: edge.fromPosition,
      toPosition,
      weight: minExitDistance(toPosition, destExits),
      directed: true,
    };
  });
}

export class StaticRoadRepository {
  private cachedEdges: RouteEdge[] | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly worldJsonCandidates = defaultWorldJsonCandidates()
  ) {}

  async findEdges(): Promise<RouteEdge[]> {
    if (this.cachedEdges) {
      return this.cachedEdges;
    }

    const worldJson = readWorldJson(this.worldJsonCandidates);
    if (!worldJson) {
      this.cachedEdges = [];
      return this.cachedEdges;
    }

    const clusterEdges = extractClusterEdges(worldJson);
    const lookupKeys = Array.from(
      new Set(clusterEdges.flatMap((edge) => [edge.fromZoneId, edge.toZoneId]))
    );
    if (lookupKeys.length === 0) {
      this.cachedEdges = [];
      return this.cachedEdges;
    }

    const result = await this.pool.query<ZoneIdRow>(
      `SELECT id, unique_name, display_name
       FROM zones
       WHERE unique_name = ANY($1::text[]) OR display_name = ANY($1::text[])`,
      [lookupKeys]
    );
    const displayCounts = new Map<string, number>();
    for (const row of result.rows) {
      displayCounts.set(row.display_name, (displayCounts.get(row.display_name) ?? 0) + 1);
    }

    const zoneIdsByLookupKey = new Map<string, string>();
    for (const row of result.rows) {
      zoneIdsByLookupKey.set(row.unique_name, row.id);
      if ((displayCounts.get(row.display_name) ?? 0) === 1) {
        zoneIdsByLookupKey.set(row.display_name, row.id);
      }
    }

    this.cachedEdges = clusterEdges.flatMap((edge) => {
      const fromZoneId = zoneIdsByLookupKey.get(edge.fromZoneId);
      const toZoneId = zoneIdsByLookupKey.get(edge.toZoneId);
      return fromZoneId && toZoneId
        ? [
            {
              fromZoneId,
              toZoneId,
              weight: edge.weight,
              fromPosition: edge.fromPosition,
              toPosition: edge.toPosition,
              directed: edge.directed,
            },
          ]
        : [];
    });
    return this.cachedEdges;
  }
}
