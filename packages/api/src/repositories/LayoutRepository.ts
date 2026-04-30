import { Pool } from "pg";
import type { Zone } from "@ao-mapper/shared";
import { rowToZone } from "./ZoneRepository";

interface PositionRow {
  zone_id: string;
  x: number;
  y: number;
}

interface LayoutNodeRow extends PositionRow {
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

export interface PersistedLayoutNode {
  zone: Zone;
  position: {
    x: number;
    y: number;
  };
}

export class LayoutRepository {
  constructor(private pool: Pool) {}

  async findAll(): Promise<Record<string, { x: number; y: number }>> {
    const result = await this.pool.query<PositionRow>(
      `SELECT zone_id, x, y FROM node_positions`
    );
    const layout: Record<string, { x: number; y: number }> = {};
    for (const row of result.rows) {
      layout[row.zone_id] = { x: row.x, y: row.y };
    }
    return layout;
  }

  async findAllNodes(): Promise<PersistedLayoutNode[]> {
    const result = await this.pool.query<LayoutNodeRow>(
      `SELECT np.zone_id, np.x, np.y,
              z.id, z.unique_name, z.display_name, z.tier, z.zone_type,
              z.city_distance, z.resources, z.metadata, z.created_at
       FROM node_positions np
       INNER JOIN zones z ON z.id = np.zone_id
       ORDER BY z.display_name`
    );

    return result.rows.map((row) => ({
      zone: rowToZone(row),
      position: {
        x: row.x,
        y: row.y,
      },
    }));
  }

  async upsert(zoneId: string, x: number, y: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO node_positions (zone_id, x, y)
       VALUES ($1, $2, $3)
       ON CONFLICT (zone_id) DO UPDATE
         SET x = EXCLUDED.x, y = EXCLUDED.y`,
      [zoneId, x, y]
    );
  }

  async delete(zoneId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM node_positions WHERE zone_id = $1`,
      [zoneId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
