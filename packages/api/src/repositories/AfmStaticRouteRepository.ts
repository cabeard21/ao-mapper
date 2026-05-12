import type { Pool } from "pg";
import type { RouteEdge } from "../services/RouteOptimizer";

type Point = [number, number];

interface AfmPortalEdge {
  id?: string;
  targetId?: string;
  targetLocationId?: string;
  position?: Point;
}

interface AfmMetadata {
  id?: string;
  exits?: AfmPortalEdge[];
  portalEntrances?: AfmPortalEdge[];
  portalExits?: AfmPortalEdge[];
}

interface AfmZoneRow {
  id: string;
  metadata: unknown;
}

interface AfmZone {
  zoneId: string;
  afmId: string;
  edges: AfmPortalEdge[];
}

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function asAfmEdges(value: unknown): AfmPortalEdge[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (edge): edge is AfmPortalEdge =>
      typeof edge === "object" &&
      edge !== null &&
      typeof (edge as AfmPortalEdge).targetLocationId === "string" &&
      ((edge as AfmPortalEdge).position === undefined || isPoint((edge as AfmPortalEdge).position))
  );
}

function parseAfmMetadata(metadata: unknown): AfmMetadata | null {
  const value =
    typeof metadata === "object" && metadata !== null
      ? (metadata as { afm?: unknown }).afm
      : null;
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const afm = value as AfmMetadata;
  return typeof afm.id === "string" ? afm : null;
}

function afmZoneFromRow(row: AfmZoneRow): AfmZone | null {
  const afm = parseAfmMetadata(row.metadata);
  if (!afm?.id) {
    return null;
  }
  return {
    zoneId: row.id,
    afmId: afm.id,
    edges: [
      ...asAfmEdges(afm.exits),
      ...asAfmEdges(afm.portalEntrances),
      ...asAfmEdges(afm.portalExits),
    ],
  };
}

function distanceFromMapCenter(position: Point | undefined): number | undefined {
  if (!position) {
    return undefined;
  }
  return Math.max(1, Math.round(Math.hypot(position[0], position[1])));
}

export class AfmStaticRouteRepository {
  private cachedEdges: RouteEdge[] | null = null;

  constructor(private readonly pool: Pool) {}

  async findEdges(): Promise<RouteEdge[]> {
    if (this.cachedEdges) {
      return this.cachedEdges;
    }

    const result = await this.pool.query<AfmZoneRow>(
      `SELECT id, metadata
       FROM zones
       WHERE metadata ? 'afm'`
    );
    const zones = result.rows.flatMap((row) => {
      const zone = afmZoneFromRow(row);
      return zone ? [zone] : [];
    });
    const zoneIdByAfmId = new Map(zones.map((zone) => [zone.afmId, zone.zoneId]));
    const positionByEdgeId = new Map<string, Point>();
    const exitPositionByZone = new Map<string, Map<string, Point>>();

    for (const zone of zones) {
      const byTarget = new Map<string, Point>();
      for (const edge of zone.edges) {
        if (edge.id && edge.position) {
          positionByEdgeId.set(edge.id, edge.position);
        }
        if (edge.targetLocationId && edge.position) {
          byTarget.set(edge.targetLocationId, edge.position);
        }
      }
      exitPositionByZone.set(zone.afmId, byTarget);
    }

    this.cachedEdges = zones.flatMap((zone) =>
      zone.edges.flatMap((edge) => {
        if (!edge.targetLocationId) {
          return [];
        }
        const targetZoneId = zoneIdByAfmId.get(edge.targetLocationId);
        if (!targetZoneId) {
          return [];
        }
        const toPosition =
          (edge.targetId ? positionByEdgeId.get(edge.targetId) : undefined) ??
          exitPositionByZone.get(edge.targetLocationId)?.get(zone.afmId);
        return [
          {
            fromZoneId: zone.zoneId,
            toZoneId: targetZoneId,
            fromPosition: edge.position,
            toPosition,
            weight: distanceFromMapCenter(edge.position),
            directed: true,
            positionsMathY: true,
          },
        ];
      })
    );
    return this.cachedEdges;
  }
}
