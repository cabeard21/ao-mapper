import { describe, expect, it } from "vitest";
import type { RouteStep, Zone } from "@ao-mapper/shared";
import { formatRouteCost, formatRouteDirection, routeHasDirections } from "./routePresentation";

const zone = (zoneType: Zone["zoneType"]): Zone => ({
  id: "zone-1",
  uniqueName: "ZONE_1",
  displayName: "Zone 1",
  tier: 6,
  zoneType,
  cityDistances: [],
  resources: [],
  metadata: {},
  createdAt: "2026-04-29T00:00:00.000Z",
});

const step = (zoneType: Zone["zoneType"], enterDirection: RouteStep["enterDirection"]): RouteStep => ({
  zone: zone(zoneType),
  enterDirection,
  exitDirection: null,
  sourceFromPrevious: "static",
  sourceToNext: null,
});

describe("routePresentation", () => {
  it("formats route cost with pluralized hops", () => {
    expect(formatRouteCost({ hops: 1, cost: 2.5 })).toBe("1 hop - cost 2.5");
    expect(formatRouteCost({ hops: 3, cost: 3 })).toBe("3 hops - cost 3");
  });

  it("formats direction chips only when a direction exists", () => {
    expect(formatRouteDirection("Enter", "NE")).toBe("Enter NE");
    expect(formatRouteDirection("Exit", null)).toBeNull();
  });

  it("suppresses direction indicators for roads zones", () => {
    expect(routeHasDirections(step("black", "SW"))).toBe(true);
    expect(routeHasDirections(step("roads", "SW"))).toBe(false);
  });
});
