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
});
