import { describe, expect, it, vi } from "vitest";
import type { Connection, Zone } from "@ao-mapper/shared";
import { RouteOptimizer, type RouteCache } from "./RouteOptimizer";

const baseConnection = {
  connType: "PORTAL_7",
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
  cityDistances: Zone["cityDistances"] = [],
  zoneType: Zone["zoneType"] = "black",
  metadata: Zone["metadata"] = {}
): Zone => ({
  id,
  uniqueName: displayName.toUpperCase().replaceAll(" ", "_"),
  displayName,
  tier: 5,
  zoneType,
  cityDistances,
  resources: [],
  metadata,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const zonesById = (zones: Zone[]) => {
  const byId = new Map(zones.map((z) => [z.id, z]));
  return async (id: string) => byId.get(id) ?? null;
};

const routeStep = (
  zone: Zone,
  enterDirection: string | null = null,
  exitDirection: string | null = null,
  sourceFromPrevious: string | null = null,
  sourceToNext: string | null = null
) => ({
  zone,
  enterDirection,
  exitDirection,
  sourceFromPrevious,
  sourceToNext,
});

describe("RouteOptimizer", () => {
  it("returns the shortest path by hop count", async () => {
    const zoneA = zone("a", "A");
    const zoneB = zone("b", "B");
    const zoneC = zone("c", "C");
    const zoneD = zone("d", "D");
    const zoneE = zone("e", "E");
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [
        connection("ab", "a", "b"),
        connection("bc", "b", "c"),
        connection("ad", "a", "d"),
        connection("dc", "d", "c"),
        connection("ce", "c", "e"),
      ],
      findZoneById: zonesById([zoneA, zoneB, zoneC, zoneD, zoneE]),
    });

    await expect(optimizer.findRoute("a", "e")).resolves.toEqual({
      path: ["a", "b", "c", "e"],
      hops: 3,
      cost: 3,
      steps: [
        routeStep(zoneA, null, null, null, "active"),
        routeStep(zoneB, null, null, "active", "active"),
        routeStep(zoneC, null, null, "active", "active"),
        routeStep(zoneE, null, null, "active", null),
      ],
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
      cost: null,
      steps: [],
    });
  });

  it("combines active connections with static road edges", async () => {
    const zoneA = zone("a", "A");
    const zoneB = zone("b", "B");
    const city = zone("city", "City");
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [connection("ab", "a", "b")],
      findStaticEdges: async () => [{ fromZoneId: "b", toZoneId: "city" }],
      findZoneById: zonesById([zoneA, zoneB, city]),
    });

    await expect(optimizer.findRoute("a", "city")).resolves.toEqual({
      path: ["a", "b", "city"],
      hops: 2,
      cost: 2,
      steps: [
        routeStep(zoneA, null, null, null, "active"),
        routeStep(zoneB, null, null, "active", "static"),
        routeStep(city, null, null, "static", null),
      ],
    });
  });

  it("prefers lower weighted cost over fewer hops", async () => {
    const zoneA = zone("a", "A");
    const zoneB = zone("b", "B");
    const zoneC = zone("c", "C");
    const zoneD = zone("d", "D");
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findStaticEdges: async () => [
        { fromZoneId: "a", toZoneId: "b", weight: 9 },
        { fromZoneId: "a", toZoneId: "c", weight: 2 },
        { fromZoneId: "c", toZoneId: "d", weight: 2 },
        { fromZoneId: "d", toZoneId: "b", weight: 2 },
      ],
      findZoneById: zonesById([zoneA, zoneB, zoneC, zoneD]),
    });

    await expect(optimizer.findRoute("a", "b")).resolves.toMatchObject({
      path: ["a", "c", "d", "b"],
      hops: 3,
      cost: 6,
    });
  });

  it("adds AFM corner directions for non-road zones", async () => {
    const zoneA = zone("a", "A", [], "black", {
      afm: {
        id: "afm-a",
        minimapBoundsMin: [0, 0],
        minimapBoundsMax: [100, 100],
        exits: [
          {
            targetLocationId: "afm-b",
            position: [90, 10],
          },
        ],
      },
    });
    const zoneB = zone("b", "B", [], "black", {
      afm: {
        id: "afm-b",
        minimapBoundsMin: [0, 0],
        minimapBoundsMax: [100, 100],
        exits: [
          {
            targetLocationId: "afm-a",
            position: [10, 90],
          },
        ],
      },
    });
    const roadsZone = zone("roads", "Roads", [], "roads", {
      afm: {
        id: "afm-roads",
        minimapBoundsMin: [0, 0],
        minimapBoundsMax: [100, 100],
        exits: [
          {
            targetLocationId: "afm-b",
            position: [90, 90],
          },
        ],
      },
    });
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findStaticEdges: async () => [
        { fromZoneId: "a", toZoneId: "roads", fromPosition: [90, 10] },
        { fromZoneId: "roads", toZoneId: "b", toPosition: [10, 90] },
      ],
      findZoneById: zonesById([zoneA, zoneB, roadsZone]),
    });

    await expect(optimizer.findRoute("a", "b")).resolves.toMatchObject({
      steps: [
        { zone: zoneA, enterDirection: null, exitDirection: "NE" },
        { zone: roadsZone, enterDirection: null, exitDirection: null },
        { zone: zoneB, enterDirection: "SW", exitDirection: null },
      ],
    });
  });

  it("uses static edge exit positions before world-map travel direction", async () => {
    const drywater = zone("drywater", "Drywater Meadow", [], "yellow", {
      afm: {
        id: "afm-drywater",
        minimapBoundsMin: [-415, -415],
        minimapBoundsMax: [415, 415],
        worldmapposition: [46.44, -391.8],
      },
    });
    const longmarch = zone("longmarch", "Longmarch Meadow", [], "yellow", {
      afm: {
        id: "afm-longmarch",
        minimapBoundsMin: [-415, -415],
        minimapBoundsMax: [415, 415],
        worldmapposition: [26.21, -387.5],
      },
    });
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findStaticEdges: async () => [
        {
          fromZoneId: "drywater",
          toZoneId: "longmarch",
          fromPosition: [-160.5, -378.5],
        },
      ],
      findZoneById: zonesById([drywater, longmarch]),
    });

    await expect(optimizer.findRoute("drywater", "longmarch")).resolves.toMatchObject({
      steps: [
        { zone: drywater, enterDirection: null, exitDirection: "NW" },
        { zone: longmarch, enterDirection: "SE", exitDirection: null },
      ],
    });
  });

  it("prefers the route with lower in-zone traversal from the current entry portal", async () => {
    const lymhurst = zone("lymhurst", "Lymhurst", [], "royal");
    const ferndell = zone("ferndell", "Ferndell", [], "blue");
    const willowWood = zone("willow", "Willow Wood", [], "yellow");
    const crackedEarth = zone("cracked", "Cracked Earth", [], "blue");
    const dryfield = zone("dryfield", "Dryfield Meadow", [], "blue");
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findStaticEdges: async () => [
        {
          fromZoneId: "lymhurst",
          toZoneId: "ferndell",
          weight: 75,
          fromPosition: [0, 0],
          toPosition: [-210.5, 378.5],
          directed: true,
        },
        {
          fromZoneId: "ferndell",
          toZoneId: "willow",
          weight: 171,
          fromPosition: [-0.5, -375.5],
          toPosition: [190.5, 375.5],
          directed: true,
        },
        {
          fromZoneId: "ferndell",
          toZoneId: "cracked",
          weight: 238,
          fromPosition: [375.5, -0.5],
          toPosition: [-335.5, -170.5],
          directed: true,
        },
        {
          fromZoneId: "willow",
          toZoneId: "dryfield",
          weight: 379,
          fromPosition: [375.5, -70.5],
          toPosition: [-378.5, 190.5],
          directed: true,
        },
        {
          fromZoneId: "cracked",
          toZoneId: "dryfield",
          weight: 379,
          fromPosition: [-162.5, -334.5],
          toPosition: [-49.5, 378.5],
          directed: true,
        },
      ],
      findZoneById: zonesById([lymhurst, ferndell, willowWood, crackedEarth, dryfield]),
    });

    await expect(optimizer.findRoute("lymhurst", "dryfield")).resolves.toMatchObject({
      path: ["lymhurst", "ferndell", "cracked", "dryfield"],
      hops: 3,
    });
  });

  it("does not use an active portal U-turn to reset static traversal position", async () => {
    const start = zone("start", "Start");
    const hub = zone("hub", "Hub");
    const road = zone("road", "Road", [], "roads");
    const target = zone("target", "Target");
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [connection("hub-road", "hub", "road")],
      findStaticEdges: async () => [
        {
          fromZoneId: "start",
          toZoneId: "hub",
          weight: 1,
          toPosition: [0, 0],
          directed: true,
        },
        {
          fromZoneId: "hub",
          toZoneId: "target",
          weight: 1,
          fromPosition: [100, 0],
          directed: true,
        },
      ],
      findZoneById: zonesById([start, hub, road, target]),
    });

    await expect(optimizer.findRoute("start", "target")).resolves.toMatchObject({
      path: ["start", "hub", "target"],
      cost: 101,
    });
  });

  it("still allows active portals as forward route segments", async () => {
    const start = zone("start", "Start");
    const road = zone("road", "Road", [], "roads");
    const target = zone("target", "Target");
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [connection("start-road", "start", "road")],
      findStaticEdges: async () => [
        {
          fromZoneId: "road",
          toZoneId: "target",
          weight: 1,
          directed: true,
        },
      ],
      findZoneById: zonesById([start, road, target]),
    });

    await expect(optimizer.findRoute("start", "target")).resolves.toMatchObject({
      path: ["start", "road", "target"],
      cost: 2,
    });
  });

  it("uses static edge destination positions for enter directions", async () => {
    const zoneA = zone("a", "A", [], "black", {
      afm: {
        id: "afm-a",
        minimapBoundsMin: [-100, -100],
        minimapBoundsMax: [100, 100],
      },
    });
    const zoneB = zone("b", "B", [], "black", {
      afm: {
        id: "afm-b",
        minimapBoundsMin: [-100, -100],
        minimapBoundsMax: [100, 100],
      },
    });
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findStaticEdges: async () => [
        {
          fromZoneId: "a",
          toZoneId: "b",
          fromPosition: [80, -80],
          toPosition: [-80, 80],
          directed: true,
        },
      ],
      findZoneById: zonesById([zoneA, zoneB]),
    });

    await expect(optimizer.findRoute("a", "b")).resolves.toMatchObject({
      steps: [
        { zone: zoneA, enterDirection: null, exitDirection: "NE" },
        { zone: zoneB, enterDirection: "SW", exitDirection: null },
      ],
    });
  });

  it("uses world-map travel direction when no exit position is available", async () => {
    const riverbed = zone("riverbed", "Drybasin Riverbed", [], "black", {
      afm: {
        id: "afm-riverbed",
        minimapBoundsMin: [-415, -415],
        minimapBoundsMax: [415, 415],
        worldmapposition: [164.12, 147.57],
      },
    });
    const oasis = zone("oasis", "Drybasin Oasis", [], "black", {
      afm: {
        id: "afm-oasis",
        minimapBoundsMin: [-415, -415],
        minimapBoundsMax: [415, 415],
        worldmapposition: [149.98, 133.29],
      },
    });
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findStaticEdges: async () => [
        {
          fromZoneId: "riverbed",
          toZoneId: "oasis",
        },
      ],
      findZoneById: zonesById([riverbed, oasis]),
    });

    await expect(optimizer.findRoute("riverbed", "oasis")).resolves.toMatchObject({
      steps: [
        { zone: riverbed, enterDirection: null, exitDirection: "SW" },
        { zone: oasis, enterDirection: "NE", exitDirection: null },
      ],
    });
  });

  it("returns city distances for a zone sorted by hop count", async () => {
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [],
      findZoneById: async (id) =>
        id === "a"
          ? zone("a", "A", [
              { cityName: "Bridgewatch", hops: 6, meters: 420 },
              { cityName: "Caerleon", hops: 2, meters: 140 },
            ])
          : null,
    });

    await expect(optimizer.findCityDistances("a")).resolves.toEqual([
      { cityName: "Caerleon", hops: 2, meters: 140 },
      { cityName: "Bridgewatch", hops: 6, meters: 420 },
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
    expect(cache.set).toHaveBeenCalledWith("route:v7:a:b", {
      path: ["a", "b"],
      hops: 1,
      cost: 1,
      steps: [],
    });
    expect(cache.deleteByPrefix).toHaveBeenCalledWith("route:");
  });

  it("recomputes routes when a cached result has the old shape", async () => {
    const cache: RouteCache = {
      get: vi.fn().mockResolvedValue({ path: ["legacy-a", "legacy-b"], hops: 1 }),
      set: vi.fn().mockResolvedValue(undefined),
      deleteByPrefix: vi.fn().mockResolvedValue(undefined),
    };
    const optimizer = new RouteOptimizer({
      findActiveConnections: async () => [connection("ab", "a", "b")],
      findZoneById: async () => null,
      cache,
    });

    await expect(optimizer.findRoute("a", "b")).resolves.toEqual({
      path: ["a", "b"],
      hops: 1,
      cost: 1,
      steps: [],
    });
  });
});
