import { beforeEach, describe, expect, it } from "vitest";
import type { Zone } from "@ao-mapper/shared";
import { useMapStore } from "./mapStore";
import { zoneToNode } from "../components/zonePresentation";

const makeZone = (id: string, displayName: string): Zone => ({
  id,
  uniqueName: displayName.toUpperCase().replace(/ /g, "_"),
  displayName,
  tier: 6,
  zoneType: "roads",
  cityDistances: [],
  resources: [{ type: "ore", tier: 6 }],
  metadata: {},
  createdAt: "2026-04-28T00:00:00.000Z",
});

describe("mapStore zone management", () => {
  beforeEach(() => {
    useMapStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      currentZoneId: null,
      routePath: [],
    });
  });

  it("adds a zone node and selects it", () => {
    const zone = makeZone("zone-1", "Tharcal Fissure");

    useMapStore.getState().addNode(zoneToNode(zone));

    expect(useMapStore.getState().nodes).toHaveLength(1);
    expect(useMapStore.getState().selectedNodeId).toBe("zone-1");
  });

  it("removes a zone with connected edges and stale route references", () => {
    const zone = makeZone("zone-1", "Tharcal Fissure");
    const otherZone = makeZone("zone-2", "Other Zone");

    useMapStore.setState({
      nodes: [zoneToNode(zone), zoneToNode(otherZone)],
      edges: [
        {
          id: "edge-1",
          source: "zone-1",
          target: "zone-2",
          connType: "PORTAL_7",
          label: "",
          durationHours: null,
          expiresAt: null,
        },
      ],
      selectedNodeId: "zone-1",
      currentZoneId: "zone-1",
      routePath: ["zone-1", "zone-2"],
    });

    useMapStore.getState().removeNode("zone-1");

    expect(useMapStore.getState().nodes.map((node) => node.id)).toEqual(["zone-2"]);
    expect(useMapStore.getState().edges).toEqual([]);
    expect(useMapStore.getState().selectedNodeId).toBeNull();
    expect(useMapStore.getState().currentZoneId).toBeNull();
    expect(useMapStore.getState().routePath).toEqual(["zone-2"]);
  });

  it("prunes older sniffed nodes without active edges", () => {
    const currentZone = makeZone("zone-current", "Current Zone");
    const staleZone = makeZone("zone-stale", "Stale Zone");
    const connectedZone = makeZone("zone-connected", "Connected Zone");
    const manualZone = makeZone("zone-manual", "Manual Zone");

    useMapStore.setState({
      nodes: [
        zoneToNode(currentZone, "sniffed"),
        zoneToNode(staleZone, "sniffed"),
        zoneToNode(connectedZone, "sniffed"),
        zoneToNode(manualZone),
      ],
      edges: [
        {
          id: "edge-1",
          source: "zone-connected",
          target: "zone-manual",
          connType: "PORTAL_7",
          label: "",
          durationHours: null,
          expiresAt: null,
        },
      ],
      selectedNodeId: "zone-stale",
      currentZoneId: "zone-stale",
      routePath: ["zone-stale", "zone-connected"],
      pendingConnectionFromNodeId: "zone-stale",
    });

    useMapStore.getState().pruneIsolatedSniffedNodes({ exceptNodeId: "zone-current" });

    expect(useMapStore.getState().nodes.map((node) => node.id)).toEqual([
      "zone-current",
      "zone-connected",
      "zone-manual",
    ]);
    expect(useMapStore.getState().edges).toHaveLength(1);
    expect(useMapStore.getState().selectedNodeId).toBeNull();
    expect(useMapStore.getState().currentZoneId).toBeNull();
    expect(useMapStore.getState().routePath).toEqual(["zone-connected"]);
    expect(useMapStore.getState().pendingConnectionFromNodeId).toBeNull();
  });

  it("does not downgrade manual nodes when re-added as sniffed", () => {
    const zone = makeZone("zone-1", "Manual Zone");

    useMapStore.getState().addNode(zoneToNode(zone));
    useMapStore.getState().addNode(zoneToNode(zone, "sniffed"));

    expect(useMapStore.getState().nodes).toEqual([
      expect.objectContaining({ id: "zone-1", source: "manual" }),
    ]);
  });

  it("adds route nodes without changing the selected zone", () => {
    const selectedZone = makeZone("zone-selected", "Selected Zone");
    const routeZone = makeZone("zone-route", "Route Zone");

    useMapStore.setState({
      nodes: [zoneToNode(selectedZone)],
      selectedNodeId: "zone-selected",
    });

    useMapStore.getState().addRouteNodes([zoneToNode(routeZone, "sniffed")]);

    expect(useMapStore.getState().nodes.map((node) => node.id)).toEqual([
      "zone-selected",
      "zone-route",
    ]);
    expect(useMapStore.getState().selectedNodeId).toBe("zone-selected");
  });
});
