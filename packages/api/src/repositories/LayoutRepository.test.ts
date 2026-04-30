import { describe, expect, it, vi } from "vitest";
import { LayoutRepository } from "./LayoutRepository";

describe("LayoutRepository", () => {
  it("loads persisted node membership with zone data and positions", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          zone_id: "11111111-1111-4111-8111-111111111111",
          x: 120,
          y: -45,
          id: "11111111-1111-4111-8111-111111111111",
          unique_name: "OPEN_WORLD_ROADS_TEST",
          display_name: "Roads Test",
          tier: 6,
          zone_type: "roads",
          city_distance: [],
          resources: [{ type: "ore", tier: 6 }],
          metadata: {},
          created_at: "2026-04-28T00:00:00.000Z",
        },
      ],
    });
    const repo = new LayoutRepository({ query } as never);

    await expect(repo.findAllNodes()).resolves.toEqual([
      {
        zone: {
          id: "11111111-1111-4111-8111-111111111111",
          uniqueName: "OPEN_WORLD_ROADS_TEST",
          displayName: "Roads Test",
          tier: 6,
          zoneType: "roads",
          cityDistances: [],
          resources: [{ type: "ore", tier: 6 }],
          metadata: {},
          createdAt: "2026-04-28T00:00:00.000Z",
        },
        position: { x: 120, y: -45 },
      },
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("node_positions"));
  });

  it("deletes persisted node membership by zone id", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repo = new LayoutRepository({ query } as never);

    await expect(
      repo.delete("11111111-1111-4111-8111-111111111111")
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      "DELETE FROM node_positions WHERE zone_id = $1",
      ["11111111-1111-4111-8111-111111111111"]
    );
  });
});
