import { describe, expect, it, vi } from "vitest";
import type { Connection, Zone } from "@ao-mapper/shared";
import { RouteOptimizer, type RouteCache } from "./RouteOptimizer";

const baseConnection = {
  connType: "AVALON_ROAD",
  durationHours: null,
  expiresAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

const connection = (
  id: string,
  fromZoneId: string,
  toZoneId: string
): Connection => ({
  ...baseConnection,
  id,
  fromZoneId,
  toZoneId,
});

const zone = (
  id: string,
  displayName: string,
  cityDistances: Zone["cityDistances"] = []
): Zone => ({
  id,
  uniqueName: displayName.toUpperCase().replaceAll(" ", "_"),
  displayName,
  tier: 5,
  zoneType: "black",
  cityDistances,
  resources: [],
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("RouteOptimizer", () => {
  it("returns the shortest path by hop count", async () => {
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [
        connection("ab", "a", "b"),
        connection("bc", "b", "c"),
        connection("ad", "a", "d"),
        connection("dc", "d", "c"),
        connection("ce", "c", "e"),
      ],
      findZoneById: async () => null,
    });

    await expect(optimizer.findRoute("a", "e")).resolves.toEqual({
      path: ["a", "b", "c", "e"],
      hops: 3,
    });
  });

  it("returns a null path for disconnected zones", async () => {
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [connection("ab", "a", "b")],
      findZoneById: async () => null,
    });

    await expect(optimizer.findRoute("a", "z")).resolves.toEqual({
      path: null,
      hops: null,
    });
  });

  it("combines active connections with static road edges", async () => {
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [connection("ab", "a", "b")],
      findStaticEdges: async () => [{ fromZoneId: "b", toZoneId: "city" }],
      findZoneById: async () => null,
    });

    await expect(optimizer.findRoute("a", "city")).resolves.toEqual({
      path: ["a", "b", "city"],
      hops: 2,
    });
  });

  it("returns city distances for a zone sorted by hop count", async () => {
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findZoneById: async (id) =>
        id === "a"
          ? zone("a", "A", [
              { cityName: "Bridgewatch", hops: 6 },
              { cityName: "Caerleon", hops: 2 },
            ])
          : null,
    });

    await expect(optimizer.findCityDistances("a")).resolves.toEqual([
      { cityName: "Caerleon", hops: 2 },
      { cityName: "Bridgewatch", hops: 6 },
    ]);
  });

  it("uses and invalidates cached route results", async () => {
    const cache: RouteCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      deleteByPrefix: vi.fn().mockResolvedValue(undefined),
    };
    const findActiveConnections = vi
      .fn()
      .mockResolvedValue([connection("ab", "a", "b")]);
    const optimizer = new RouteOptimizer({
      findActiveConnections,
      findZoneById: async () => null,
      cache,
    });

    await optimizer.findRoute("a", "b");
    await optimizer.invalidateRoutes();

    expect(findActiveConnections).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith("route:a:b", {
      path: ["a", "b"],
      hops: 1,
    });
    expect(cache.deleteByPrefix).toHaveBeenCalledWith("route:");
  });
});
