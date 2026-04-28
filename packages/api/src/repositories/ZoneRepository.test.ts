import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { ZoneRepository } from "./ZoneRepository";

const mockZoneRow = {
  id: "uuid-1",
  unique_name: "TEST_ZONE",
  display_name: "Test Zone",
  tier: 5,
  zone_type: "black",
  city_distance: "[]",
  resources: "[]",
  metadata: "{}",
  created_at: new Date("2025-01-01T00:00:00Z").toISOString(),
};

function createMockPool(rows: object[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as Pool;
}

describe("ZoneRepository", () => {
  describe("findAll", () => {
    it("returns array of Zone objects with camelCase fields", async () => {
      const pool = createMockPool([mockZoneRow]);
      const repo = new ZoneRepository(pool);

      const result = await repo.findAll({});

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "uuid-1",
        uniqueName: "TEST_ZONE",
        displayName: "Test Zone",
        tier: 5,
        zoneType: "black",
        cityDistances: [],
        resources: [],
        metadata: {},
      });
      expect(result[0].createdAt).toBe("2025-01-01T00:00:00.000Z");
    });

    it("builds dynamic WHERE clause for filters", async () => {
      const pool = createMockPool([]);
      const repo = new ZoneRepository(pool);

      await repo.findAll({ q: "foo", tier: 5, type: "black", limit: 10, offset: 5 });

      const queryFn = pool.query as unknown as ReturnType<typeof vi.fn>;
      const [sql, params] = queryFn.mock.calls[0];
      expect(sql).toContain("display_name ILIKE");
      expect(sql).toContain("tier =");
      expect(sql).toContain("zone_type =");
      expect(sql).toContain("LIMIT");
      expect(sql).toContain("OFFSET");
      expect(params).toEqual(["%foo%", 5, "black", 10, 5]);
    });

    it("omits WHERE clause when no filters present", async () => {
      const pool = createMockPool([]);
      const repo = new ZoneRepository(pool);

      await repo.findAll({});

      const queryFn = pool.query as unknown as ReturnType<typeof vi.fn>;
      const [sql] = queryFn.mock.calls[0];
      expect(sql).not.toContain("WHERE");
    });
  });

  describe("search", () => {
    it("calls ILIKE query and returns results", async () => {
      const pool = createMockPool([mockZoneRow]);
      const repo = new ZoneRepository(pool);

      const result = await repo.search("test");

      const queryFn = pool.query as unknown as ReturnType<typeof vi.fn>;
      const [sql, params] = queryFn.mock.calls[0];
      expect(sql).toContain("ILIKE");
      expect(sql).toContain("display_name");
      expect(sql).toContain("unique_name");
      expect(params).toEqual(["%test%", 20]);
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("Test Zone");
    });
  });

  describe("findById", () => {
    it("returns null when zone is not found", async () => {
      const pool = createMockPool([]);
      const repo = new ZoneRepository(pool);

      const result = await repo.findById("unknown-uuid");

      expect(result).toBeNull();
    });

    it("returns the zone when found", async () => {
      const pool = createMockPool([mockZoneRow]);
      const repo = new ZoneRepository(pool);

      const result = await repo.findById("uuid-1");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("uuid-1");
      expect(result?.uniqueName).toBe("TEST_ZONE");
    });
  });

  describe("count", () => {
    it("returns total count from query", async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [{ count: 42 }], rowCount: 1 }),
      } as unknown as Pool;
      const repo = new ZoneRepository(pool);

      const total = await repo.count({});

      expect(total).toBe(42);
    });
  });
});
