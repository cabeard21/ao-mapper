import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { ConnectionRepository } from "./ConnectionRepository";

interface RowOverrides {
  id?: string;
  from_zone_id?: string;
  to_zone_id?: string;
  conn_type?: string;
  duration_hours?: number | null;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

const makeRow = (overrides: RowOverrides = {}) => ({
  id: "uuid-1",
  from_zone_id: "zone-a",
  to_zone_id: "zone-b",
  conn_type: "PORTAL_7",
  duration_hours: 22,
  expires_at: null,
  created_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  updated_at: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  ...overrides,
});

const makeMockPool = (rows: object[]) => {
  const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
  return { pool: { query } as unknown as Pool, query };
};

describe("ConnectionRepository", () => {
  it("findActive returns Connection[] with camelCase fields", async () => {
    const { pool } = makeMockPool([makeRow()]);
    const repo = new ConnectionRepository(pool);

    const result = await repo.findActive();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "uuid-1",
      fromZoneId: "zone-a",
      toZoneId: "zone-b",
      connType: "PORTAL_7",
      durationHours: 22,
      expiresAt: null,
    });
    expect(result[0].createdAt).toBe(new Date("2026-01-01T00:00:00.000Z").toISOString());
  });

  it("create with durationHours calls query with correct params", async () => {
    const { pool, query } = makeMockPool([
      makeRow({ duration_hours: 4, expires_at: "2026-01-01T04:00:00.000Z" }),
    ]);
    const repo = new ConnectionRepository(pool);

    const created = await repo.create({
      fromZoneId: "zone-a",
      toZoneId: "zone-b",
      connType: "PORTAL_7",
      durationHours: 4,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const callArgs = query.mock.calls[0];
    const sql = callArgs[0] as string;
    const params = callArgs[1] as unknown[];

    expect(sql).toContain("INSERT INTO connections");
    expect(params).toEqual(["zone-a", "zone-b", "PORTAL_7", 4, 4]);
    expect(created.durationHours).toBe(4);
    expect(created.fromZoneId).toBe("zone-a");
  });

  it("create without durationHours stores a permanent connection", async () => {
    const { pool, query } = makeMockPool([
      makeRow({ duration_hours: null, expires_at: null }),
    ]);
    const repo = new ConnectionRepository(pool);

    const created = await repo.create({
      fromZoneId: "zone-a",
      toZoneId: "zone-b",
      connType: "PORTAL_20",
      durationHours: null,
    });

    const params = query.mock.calls[0][1] as unknown[];
    expect(params).toEqual(["zone-a", "zone-b", "PORTAL_20", null, null]);
    expect(created.durationHours).toBeNull();
    expect(created.expiresAt).toBeNull();
  });

  it("delete with empty result returns false", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const pool = { query } as unknown as Pool;
    const repo = new ConnectionRepository(pool);

    const result = await repo.delete("missing-id");

    expect(result).toBe(false);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM connections"),
      ["missing-id"]
    );
  });

  it("delete with rowCount > 0 returns true", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const repo = new ConnectionRepository(pool);

    const result = await repo.delete("uuid-1");
    expect(result).toBe(true);
  });

  it("findById returns null when no row found", async () => {
    const { pool } = makeMockPool([]);
    const repo = new ConnectionRepository(pool);

    const result = await repo.findById("missing");
    expect(result).toBeNull();
  });

  it("markExpired returns recently expired connection ids", async () => {
    const { pool } = makeMockPool([{ id: "expired-1" }, { id: "expired-2" }]);
    const repo = new ConnectionRepository(pool);
    expect(await repo.markExpired()).toEqual(["expired-1", "expired-2"]);
  });
});
