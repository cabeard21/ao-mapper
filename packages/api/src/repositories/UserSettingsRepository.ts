import type { Pool } from "pg";

export interface UserSettings {
  homeZoneId: string | null;
}

interface UserSettingsRow {
  home_zone_id: string | null;
}

export class UserSettingsRepository {
  constructor(private pool: Pool) {}

  async get(): Promise<UserSettings> {
    const result = await this.pool.query<UserSettingsRow>(
      `SELECT home_zone_id FROM user_settings WHERE id = TRUE`
    );
    const row = result.rows[0];
    return { homeZoneId: row?.home_zone_id ?? null };
  }

  async setHomeZone(zoneId: string): Promise<void> {
    const exists = await this.pool.query(
      `SELECT id FROM zones WHERE id = $1`,
      [zoneId]
    );
    if (exists.rowCount === 0) {
      throw new Error(`Zone not found: ${zoneId}`);
    }
    await this.pool.query(
      `UPDATE user_settings SET home_zone_id = $1, updated_at = NOW() WHERE id = TRUE`,
      [zoneId]
    );
  }

  async clearHomeZone(): Promise<void> {
    await this.pool.query(
      `UPDATE user_settings SET home_zone_id = NULL, updated_at = NOW() WHERE id = TRUE`
    );
  }
}
