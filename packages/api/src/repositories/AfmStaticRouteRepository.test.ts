import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { AfmStaticRouteRepository } from "./AfmStaticRouteRepository";

function createPool(rows: object[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as Pool;
}

describe("AfmStaticRouteRepository", () => {
  it("resolves AFM portal targets into directed route edges with paired positions", async () => {
    const pool = createPool([
      {
        id: "deepwood-zone",
        metadata: {
          afm: {
            id: "deepwood",
            exits: [
              {
                id: "deepwood-bridgewatch",
                targetId: "bridgewatch-deepwood",
                targetLocationId: "bridgewatch",
                position: [30, 40],
              },
            ],
          },
        },
      },
      {
        id: "bridgewatch-zone",
        metadata: {
          afm: {
            id: "bridgewatch",
            exits: [
              {
                id: "bridgewatch-deepwood",
                targetId: "deepwood-bridgewatch",
                targetLocationId: "deepwood",
                position: [-10, 20],
              },
            ],
          },
        },
      },
      {
        id: "unmatched-zone",
        metadata: {
          afm: {
            id: "unmatched",
            exits: [
              {
                id: "unmatched-missing",
                targetLocationId: "missing",
                position: [5, 5],
              },
            ],
          },
        },
      },
    ]);
    const repo = new AfmStaticRouteRepository(pool);

    await expect(repo.findEdges()).resolves.toEqual(
      expect.arrayContaining([
        {
          fromZoneId: "deepwood-zone",
          toZoneId: "bridgewatch-zone",
          fromPosition: [30, 40],
          toPosition: [-10, 20],
          weight: 50,
          directed: true,
          positionsMathY: true,
        },
        {
          fromZoneId: "bridgewatch-zone",
          toZoneId: "deepwood-zone",
          fromPosition: [-10, 20],
          toPosition: [30, 40],
          weight: 22,
          directed: true,
          positionsMathY: true,
        },
      ])
    );
  });

  it("falls back to zone-pair lookup for toPosition when targetId is absent", async () => {
    const pool = createPool([
      {
        id: "zone-a",
        metadata: {
          afm: {
            id: "a",
            exits: [
              {
                id: "a-b",
                // targetId intentionally absent
                targetLocationId: "b",
                position: [10, 20],
              },
            ],
          },
        },
      },
      {
        id: "zone-b",
        metadata: {
          afm: {
            id: "b",
            exits: [
              {
                id: "b-a",
                targetId: "a-b",
                targetLocationId: "a",
                position: [5, 15],
              },
            ],
          },
        },
      },
    ]);
    const repo = new AfmStaticRouteRepository(pool);
    await expect(repo.findEdges()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromZoneId: "zone-a",
          toZoneId: "zone-b",
          toPosition: [5, 15], // zone-b's exit toward zone-a, populated via fallback
        }),
      ])
    );
  });
});
