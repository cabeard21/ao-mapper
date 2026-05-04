import { beforeEach, describe, expect, it } from "vitest";
import type { Zone } from "@ao-mapper/shared";
import { isNodePositionPersistable, routePathToVisualEdges, useMapStore } from "./mapStore";
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
      savedNodePositions: {},
      selectedNodeId: null,
      currentZoneId: null,
      homeZoneId: null,
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
      savedNodePositions: {
        "zone-1": { x: 1, y: 2 },
        "zone-2": { x: 3, y: 4 },
      },
    });

    useMapStore.getState().removeNode("zone-1");

    expect(useMapStore.getState().nodes.map((node) => node.id)).toEqual(["zone-2"]);
    expect(useMapStore.getState().edges).toEqual([]);
    expect(useMapStore.getState().selectedNodeId).toBeNull();
    expect(useMapStore.getState().currentZoneId).toBeNull();
    expect(useMapStore.getState().routePath).toEqual(["zone-2"]);
    expect(useMapStore.getState().savedNodePositions).toEqual({
      "zone-2": { x: 3, y: 4 },
    });
  });

  describe("pruneIsolatedNodes", () => {
    it("removes sniffed node with no connections when not protected", () => {
      const staleZone = makeZone("zone-stale", "Stale Zone");
      const connectedZone = makeZone("zone-connected", "Connected Zone");
      const anchorZone = makeZone("zone-anchor", "Anchor Zone");

      useMapStore.setState({
        nodes: [
          zoneToNode(staleZone, "sniffed"),
          zoneToNode(connectedZone, "sniffed"),
          zoneToNode(anchorZone, "sniffed"),
        ],
        edges: [
          {
            id: "edge-1",
            source: "zone-connected",
            target: "zone-anchor",
            connType: "PORTAL_7",
            label: "",
            durationHours: null,
            expiresAt: null,
          },
        ],
        currentZoneId: "zone-anchor",
        routePath: [],
        homeZoneId: null,
      });

      useMapStore.getState().pruneIsolatedNodes("zone-anchor");

      expect(useMapStore.getState().nodes.map((n) => n.id)).toEqual([
        "zone-connected",
        "zone-anchor",
      ]);
    });

    it("removes manual node with no connections", () => {
      const orphanZone = makeZone("zone-orphan", "Orphan Zone");
      const connectedZone = makeZone("zone-a", "Zone A");
      const otherZone = makeZone("zone-b", "Zone B");

      useMapStore.setState({
        nodes: [
          zoneToNode(orphanZone),
          zoneToNode(connectedZone),
          zoneToNode(otherZone, "sniffed"),
        ],
        edges: [
          {
            id: "edge-ab",
            source: "zone-a",
            target: "zone-b",
            connType: "PORTAL_7",
            label: "",
            durationHours: null,
            expiresAt: null,
          },
        ],
        currentZoneId: null,
        routePath: [],
        homeZoneId: null,
      });

      useMapStore.getState().pruneIsolatedNodes();

      expect(useMapStore.getState().nodes.map((n) => n.id)).toEqual(["zone-a", "zone-b"]);
    });

    it("skips node in routePath", () => {
      const routeZone = makeZone("zone-route", "Route Zone");

      useMapStore.setState({
        nodes: [zoneToNode(routeZone, "route")],
        edges: [],
        currentZoneId: null,
        routePath: ["zone-route"],
        homeZoneId: null,
      });

      useMapStore.getState().pruneIsolatedNodes();

      expect(useMapStore.getState().nodes).toHaveLength(1);
    });

    it("skips currentZoneId node", () => {
      const currentZone = makeZone("zone-current", "Current Zone");

      useMapStore.setState({
        nodes: [zoneToNode(currentZone, "sniffed")],
        edges: [],
        currentZoneId: "zone-current",
        routePath: [],
        homeZoneId: null,
      });

      useMapStore.getState().pruneIsolatedNodes();

      expect(useMapStore.getState().nodes).toHaveLength(1);
    });

    it("skips homeZoneId node", () => {
      const homeZone = makeZone("zone-home", "Home Zone");

      useMapStore.setState({
        nodes: [zoneToNode(homeZone)],
        edges: [],
        currentZoneId: null,
        routePath: [],
        homeZoneId: "zone-home",
      });

      useMapStore.getState().pruneIsolatedNodes();

      expect(useMapStore.getState().nodes).toHaveLength(1);
    });

    it("skips the explicit exceptNodeId", () => {
      const exceptZone = makeZone("zone-except", "Except Zone");

      useMapStore.setState({
        nodes: [zoneToNode(exceptZone, "sniffed")],
        edges: [],
        currentZoneId: null,
        routePath: [],
        homeZoneId: null,
      });

      useMapStore.getState().pruneIsolatedNodes("zone-except");

      expect(useMapStore.getState().nodes).toHaveLength(1);
    });

    it("skips nodes that have at least one real edge", () => {
      const nodeA = makeZone("zone-a", "Zone A");
      const nodeB = makeZone("zone-b", "Zone B");

      useMapStore.setState({
        nodes: [zoneToNode(nodeA), zoneToNode(nodeB)],
        edges: [
          {
            id: "edge-ab",
            source: "zone-a",
            target: "zone-b",
            connType: "PORTAL_7",
            label: "",
            durationHours: null,
            expiresAt: null,
          },
        ],
        currentZoneId: null,
        routePath: [],
        homeZoneId: null,
      });

      useMapStore.getState().pruneIsolatedNodes();

      expect(useMapStore.getState().nodes).toHaveLength(2);
    });

    it("cleans up stale selected/pending state for pruned nodes", () => {
      const staleZone = makeZone("zone-stale", "Stale Zone");
      useMapStore.setState({
        nodes: [zoneToNode(staleZone, "sniffed")],
        edges: [],
        selectedNodeId: "zone-stale",
        currentZoneId: null,
        routePath: [],
        homeZoneId: null,
        pendingConnectionFromNodeId: "zone-stale",
      });

      useMapStore.getState().pruneIsolatedNodes();

      expect(useMapStore.getState().nodes).toHaveLength(0);
      expect(useMapStore.getState().selectedNodeId).toBeNull();
      expect(useMapStore.getState().pendingConnectionFromNodeId).toBeNull();
    });
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

  it("clears route-only nodes when clearing the active route", () => {
    const routeZone = makeZone("zone-route", "Route Zone");
    const manualZone = makeZone("zone-manual", "Manual Zone");
    const sniffedZone = makeZone("zone-sniffed", "Sniffed Zone");

    useMapStore.setState({
      nodes: [
        zoneToNode(routeZone, "route"),
        zoneToNode(manualZone),
        zoneToNode(sniffedZone, "sniffed"),
      ],
      selectedNodeId: "zone-route",
      currentZoneId: "zone-route",
      routePath: ["zone-route", "zone-manual"],
    });

    useMapStore.getState().clearRoute();

    expect(useMapStore.getState().nodes.map((node) => node.id)).toEqual([
      "zone-manual",
      "zone-sniffed",
    ]);
    expect(useMapStore.getState().routePath).toEqual([]);
    expect(useMapStore.getState().selectedNodeId).toBeNull();
    expect(useMapStore.getState().currentZoneId).toBeNull();
  });

  it("stores persisted node positions immutably", () => {
    useMapStore.setState({
      savedNodePositions: {
        "zone-1": { x: 1, y: 2 },
      },
    });

    useMapStore.getState().upsertSavedNodePosition("zone-2", { x: 3, y: 4 });

    expect(useMapStore.getState().savedNodePositions).toEqual({
      "zone-1": { x: 1, y: 2 },
      "zone-2": { x: 3, y: 4 },
    });
  });

  it("only allows manually added nodes to persist layout membership", () => {
    const manualZone = makeZone("zone-manual", "Manual Zone");
    const sniffedZone = makeZone("zone-sniffed", "Sniffed Zone");

    expect(
      isNodePositionPersistable([
        zoneToNode(manualZone),
        zoneToNode(sniffedZone, "sniffed"),
      ], "zone-manual")
    ).toBe(true);
    expect(
      isNodePositionPersistable([
        zoneToNode(manualZone),
        zoneToNode(sniffedZone, "sniffed"),
      ], "zone-sniffed")
    ).toBe(false);
  });

  it("creates visual-only edges between adjacent route nodes that are not already connected", () => {
    expect(
      routePathToVisualEdges(["zone-a", "zone-b", "zone-c"], [
        {
          id: "existing-bc",
          source: "zone-b",
          target: "zone-c",
          connType: "PORTAL_7",
          label: "",
          durationHours: null,
          expiresAt: null,
        },
      ])
    ).toEqual([
      {
        id: "route:zone-a:zone-b",
        source: "zone-a",
        target: "zone-b",
        connType: "PORTAL_7",
        label: "",
        durationHours: null,
        expiresAt: null,
        isRouteVisual: true,
      },
    ]);
  });
});
