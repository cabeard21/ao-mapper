import { Pool } from "pg";

interface PositionRow {
  zone_id: string;
  x: number;
  y: number;
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

  async upsert(zoneId: string, x: number, y: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO node_positions (zone_id, x, y)
       VALUES ($1, $2, $3)
       ON CONFLICT (zone_id) DO UPDATE
         SET x = EXCLUDED.x, y = EXCLUDED.y`,
      [zoneId, x, y]
    );
  }
}
