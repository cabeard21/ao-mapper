import { Pool } from "pg";
import type { Zone, Resource, CityDistance } from "@ao-mapper/shared";

export interface ZoneFilters {
  q?: string;
  tier?: number;
  type?: string;
  limit?: number;
  offset?: number;
}

interface ZoneRow {
  id: string;
  unique_name: string;
  display_name: string;
  tier: number;
  zone_type: string;
  city_distance: unknown;
  resources: unknown;
  metadata: unknown;
  created_at: Date | string;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function rowToZone(row: ZoneRow): Zone {
  const cityDistances = parseJsonField<CityDistance[]>(row.city_distance, []);
  const resources = parseJsonField<Resource[]>(row.resources, []);
  const metadata = parseJsonField<Record<string, unknown>>(row.metadata, {});
  const createdAt =
    row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString();

  return {
    id: row.id,
    uniqueName: row.unique_name,
    displayName: row.display_name,
    tier: row.tier,
    zoneType: row.zone_type as Zone["zoneType"],
    cityDistances,
    resources,
    metadata,
    createdAt,
  };
}

export class ZoneRepository {
  constructor(private pool: Pool) {}

  async findAll(filters: ZoneFilters): Promise<Zone[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.q) {
      params.push(`%${filters.q}%`);
      conditions.push(`display_name ILIKE $${params.length}`);
    }
    if (filters.tier !== undefined) {
      params.push(filters.tier);
      conditions.push(`tier = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      conditions.push(`zone_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limit = filters.limit ?? DEFAULT_LIMIT;
    const offset = filters.offset ?? DEFAULT_OFFSET;
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const sql = `
      SELECT id, unique_name, display_name, tier, zone_type,
             city_distance, resources, metadata, created_at
      FROM zones
      ${whereClause}
      ORDER BY display_name
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await this.pool.query<ZoneRow>(sql, params);
    return result.rows.map(rowToZone);
  }

  async count(filters: Omit<ZoneFilters, "limit" | "offset">): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.q) {
      params.push(`%${filters.q}%`);
      conditions.push(`display_name ILIKE $${params.length}`);
    }
    if (filters.tier !== undefined) {
      params.push(filters.tier);
      conditions.push(`tier = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      conditions.push(`zone_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT COUNT(*)::int AS count FROM zones ${whereClause}`;
    const result = await this.pool.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async findById(id: string): Promise<Zone | null> {
    const sql = `
      SELECT id, unique_name, display_name, tier, zone_type,
             city_distance, resources, metadata, created_at
      FROM zones
      WHERE id = $1
    `;
    const result = await this.pool.query<ZoneRow>(sql, [id]);
    if (result.rowCount === 0 || result.rows.length === 0) {
      return null;
    }
    return rowToZone(result.rows[0]);
  }

  async search(q: string, limit = 20): Promise<Zone[]> {
    const sql = `
      SELECT id, unique_name, display_name, tier, zone_type,
             city_distance, resources, metadata, created_at
      FROM zones
      WHERE display_name ILIKE $1 OR unique_name ILIKE $1
      ORDER BY display_name
      LIMIT $2
    `;
    const result = await this.pool.query<ZoneRow>(sql, [`%${q}%`, limit]);
    return result.rows.map(rowToZone);
  }

}
