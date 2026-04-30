import { describe, expect, it } from "vitest";
import type { Connection, Zone } from "@ao-mapper/shared";
import { getConnectionZoneIds, layoutNodesToPositionMap } from "./useMapData";

const zone = (id: string, displayName: string): Zone => ({
  id,
  uniqueName: displayName.toUpperCase().replace(/ /g, "_"),
  displayName,
  tier: 6,
  zoneType: "roads",
  cityDistances: [],
  resources: [],
  metadata: {},
  createdAt: "2026-04-28T00:00:00.000Z",
});

const connection = (
  id: string,
  fromZoneId: string,
  toZoneId: string
): Connection => ({
  id,
  fromZoneId,
  toZoneId,
  connType: "PORTAL_7",
  durationHours: null,
  expiresAt: null,
  createdAt: "2026-04-28T00:00:00.000Z",
  updatedAt: "2026-04-28T00:00:00.000Z",
});

describe("map data persistence helpers", () => {
  it("deduplicates connection endpoint zone ids for reload hydration", () => {
    expect(
      getConnectionZoneIds([
        connection("a-b", "zone-a", "zone-b"),
        connection("b-c", "zone-b", "zone-c"),
      ])
    ).toEqual(["zone-a", "zone-b", "zone-c"]);
  });

  it("maps persisted layout nodes to saved positions by zone id", () => {
    expect(
      layoutNodesToPositionMap([
        { zone: zone("zone-a", "Zone A"), position: { x: 10, y: 20 } },
        { zone: zone("zone-b", "Zone B"), position: { x: -5, y: 12 } },
      ])
    ).toEqual({
      "zone-a": { x: 10, y: 20 },
      "zone-b": { x: -5, y: 12 },
    });
  });
});
