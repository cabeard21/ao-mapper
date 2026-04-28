import { Pool } from "pg";
import { Connection, ConnectionType } from "@ao-mapper/shared";

export interface CreateConnectionData {
  fromZoneId: string;
  toZoneId: string;
  connType: ConnectionType;
  durationHours?: number;
}

export interface UpdateConnectionData {
  connType?: ConnectionType;
  durationHours?: number | null;
}

interface ConnectionRow {
  id: string;
  from_zone_id: string;
  to_zone_id: string;
  conn_type: string;
  duration_hours: number | null;
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const toIso = (value: Date | string | null): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
};

const mapRow = (row: ConnectionRow): Connection => ({
  id: row.id,
  fromZoneId: row.from_zone_id,
  toZoneId: row.to_zone_id,
  connType: row.conn_type as ConnectionType,
  durationHours: row.duration_hours,
  expiresAt: toIso(row.expires_at),
  createdAt: toIso(row.created_at) as string,
  updatedAt: toIso(row.updated_at) as string,
});

export class ConnectionRepository {
  constructor(private pool: Pool) {}

  async findActive(): Promise<Connection[]> {
    const result = await this.pool.query<ConnectionRow>(
      `SELECT * FROM connections
       WHERE expires_at IS NULL OR expires_at > now()
       ORDER BY created_at DESC`
    );
    return result.rows.map(mapRow);
  }

  async findExpired(): Promise<Connection[]> {
    const result = await this.pool.query<ConnectionRow>(
      `SELECT * FROM connections
       WHERE expires_at < now() AND expires_at > now() - interval '24 hours'
       ORDER BY expires_at DESC`
    );
    return result.rows.map(mapRow);
  }

  async findById(id: string): Promise<Connection | null> {
    const result = await this.pool.query<ConnectionRow>(
      `SELECT * FROM connections WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  }

  async create(data: CreateConnectionData): Promise<Connection> {
    const { fromZoneId, toZoneId, connType, durationHours } = data;
    const hours = durationHours ?? 1;
    const result = await this.pool.query<ConnectionRow>(
      `INSERT INTO connections (from_zone_id, to_zone_id, conn_type, duration_hours, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 * interval '1 hour'))
       RETURNING *`,
      [fromZoneId, toZoneId, connType, durationHours ?? null, hours]
    );
    return mapRow(result.rows[0]);
  }

  async update(id: string, data: UpdateConnectionData): Promise<Connection | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.connType !== undefined) {
      sets.push(`conn_type = $${paramIndex++}`);
      values.push(data.connType);
    }

    if (Object.prototype.hasOwnProperty.call(data, "durationHours")) {
      sets.push(`duration_hours = $${paramIndex++}`);
      values.push(data.durationHours);
      if (data.durationHours === null) {
        sets.push(`expires_at = NULL`);
      } else {
        sets.push(`expires_at = now() + ($${paramIndex++} * interval '1 hour')`);
        values.push(data.durationHours);
      }
    }

    sets.push(`updated_at = now()`);

    if (sets.length === 1) {
      // Only updated_at was set; nothing to change but still bump updated_at
    }

    values.push(id);
    const idParam = paramIndex;

    const result = await this.pool.query<ConnectionRow>(
      `UPDATE connections SET ${sets.join(", ")} WHERE id = $${idParam} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return null;
    return mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM connections WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markExpired(): Promise<string[]> {
    // Expiry is enforced at query time via expires_at comparisons.
    // No state change required here.
    return [];
  }
}
