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
  exits?: {
    exit?: ExitEntry[] | ExitEntry;
  };
}

interface ExitEntry {
  "@targetid"?: string;
  "@targettype"?: string;
}

interface ZoneIdRow {
  id: string;
  display_name: string;
}

const WORLD_JSON_CANDIDATES = [
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

function readWorldJson(): WorldJson | null {
  const filePath = WORLD_JSON_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!filePath) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as WorldJson;
}

function extractClusterEdges(worldJson: WorldJson): RouteEdge[] {
  const clusterEdges: RouteEdge[] = [];
  const clusters = arrayOf(worldJson.world?.clusters?.cluster);

  for (const cluster of clusters) {
    const fromClusterId = cluster["@id"];
    if (!fromClusterId) {
      continue;
    }

    for (const exit of arrayOf(cluster.exits?.exit)) {
      if (exit["@targettype"] !== "Cluster") {
        continue;
      }

      const toClusterId = targetClusterId(exit["@targetid"]);
      if (toClusterId) {
        clusterEdges.push({ fromZoneId: fromClusterId, toZoneId: toClusterId });
      }
    }
  }

  return clusterEdges;
}

export class StaticRoadRepository {
  private cachedEdges: RouteEdge[] | null = null;

  constructor(private readonly pool: Pool) {}

  async findEdges(): Promise<RouteEdge[]> {
    if (this.cachedEdges) {
      return this.cachedEdges;
    }

    const worldJson = readWorldJson();
    if (!worldJson) {
      this.cachedEdges = [];
      return this.cachedEdges;
    }

    const clusterEdges = extractClusterEdges(worldJson);
    const clusterIds = Array.from(
      new Set(clusterEdges.flatMap((edge) => [edge.fromZoneId, edge.toZoneId]))
    );
    if (clusterIds.length === 0) {
      this.cachedEdges = [];
      return this.cachedEdges;
    }

    const result = await this.pool.query<ZoneIdRow>(
      `SELECT id, display_name FROM zones WHERE display_name = ANY($1::text[])`,
      [clusterIds]
    );
    const zoneIdsByClusterId = new Map(
      result.rows.map((row) => [row.display_name, row.id])
    );

    this.cachedEdges = clusterEdges.flatMap((edge) => {
      const fromZoneId = zoneIdsByClusterId.get(edge.fromZoneId);
      const toZoneId = zoneIdsByClusterId.get(edge.toZoneId);
      return fromZoneId && toZoneId ? [{ fromZoneId, toZoneId }] : [];
    });
    return this.cachedEdges;
  }
}
