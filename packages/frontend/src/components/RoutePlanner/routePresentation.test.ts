import { describe, expect, it } from "vitest";
import type { RouteStep, Zone } from "@ao-mapper/shared";
import {
  centeredRouteScrollTop,
  findPlannerShortcutZone,
  formatRouteCost,
  formatRouteDirection,
  routeHasDirections,
  swapPlannerZones,
} from "./routePresentation";
import { plannerStyle, resultsStyle, summaryStyle } from "./RoutePlanner";
import { zoneToNode } from "../zonePresentation";

const zone = (zoneType: Zone["zoneType"], id = "zone-1", displayName = "Zone 1"): Zone => ({
  id,
  uniqueName: displayName.toUpperCase().replace(/ /g, "_"),
  displayName,
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

  it("finds a route planner shortcut zone from a current or home node", () => {
    const homeZone = zone("roads", "zone-home", "Home Zone");
    const currentZone = zone("black", "zone-current", "Current Zone");

    expect(
      findPlannerShortcutZone([zoneToNode(homeZone), zoneToNode(currentZone, "sniffed")], "zone-current")
    ).toEqual(currentZone);
    expect(findPlannerShortcutZone([zoneToNode(homeZone)], "zone-missing")).toBeNull();
    expect(findPlannerShortcutZone([zoneToNode(homeZone)], null)).toBeNull();
  });

  it("swaps selected route planner zones", () => {
    const fromZone = zone("roads", "zone-from", "From Zone");
    const toZone = zone("black", "zone-to", "To Zone");

    expect(swapPlannerZones(fromZone, toZone)).toEqual({
      fromZone: toZone,
      toZone: fromZone,
    });
    expect(swapPlannerZones(fromZone, null)).toEqual({
      fromZone: null,
      toZone: fromZone,
    });
  });

  it("centers the current route step within the scrollable summary", () => {
    expect(
      centeredRouteScrollTop(
        { clientHeight: 300, scrollHeight: 1_000 },
        { offsetTop: 500, offsetHeight: 60 }
      )
    ).toBe(348);
    expect(
      centeredRouteScrollTop(
        { clientHeight: 300, scrollHeight: 1_000 },
        { offsetTop: 20, offsetHeight: 60 }
      )
    ).toBe(0);
    expect(
      centeredRouteScrollTop(
        { clientHeight: 300, scrollHeight: 1_000 },
        { offsetTop: 950, offsetHeight: 60 }
      )
    ).toBe(700);
  });

  it("keeps dropdowns above the zone panel while long route summaries remain scrollable", () => {
    expect(plannerStyle).toMatchObject({
      flexShrink: 0,
      overflowY: "visible",
    });
    expect(resultsStyle).toMatchObject({
      zIndex: 100,
    });
    expect(summaryStyle).toMatchObject({
      maxHeight: "32vh",
      overflowY: "auto",
    });
  });
});
