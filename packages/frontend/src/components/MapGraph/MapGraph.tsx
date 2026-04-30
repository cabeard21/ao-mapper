import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { useCallback, useEffect, useRef } from "react";
import axios from "axios";
import {
  isNodePositionPersistable,
  routePathToVisualEdges,
  useMapStore,
  type SavedNodePosition,
} from "../../store/mapStore";
import { AddConnectionModal } from "../AddConnectionModal/AddConnectionModal";
import { ConnectionToolbar } from "../ConnectionToolbar/ConnectionToolbar";
import { EdgeContextMenu } from "../EdgeContextMenu/EdgeContextMenu";
import { graphStyles } from "./graphStyles";
import { readableLayoutOptions, shouldLayoutAfterRouteVisualEdges } from "./graphLayout";
import { getPrimaryZoneIcon } from "../zonePresentation";

cytoscape.use(fcose);

const defaultSettings: cytoscape.CytoscapeOptions = {
  minZoom: 0.05,
  maxZoom: 1.75,
  wheelSensitivity: 0.25,
  zoomingEnabled: true,
  userZoomingEnabled: true,
  panningEnabled: true,
  userPanningEnabled: true,
  boxSelectionEnabled: true,
  selectionType: "single",
  layout: readableLayoutOptions,
};

export function MapGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const nodes = useMapStore((s) => s.nodes);
  const edges = useMapStore((s) => s.edges);
  const savedNodePositions = useMapStore((s) => s.savedNodePositions);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const currentZoneId = useMapStore((s) => s.currentZoneId);
  const routePath = useMapStore((s) => s.routePath);
  const isConnectionDrawMode = useMapStore((s) => s.isConnectionDrawMode);
  const pendingConnectionFromNodeId = useMapStore(
    (s) => s.pendingConnectionFromNodeId
  );
  const setSelectedNode = useMapStore((s) => s.setSelectedNode);
  const setSavedNodePositions = useMapStore((s) => s.setSavedNodePositions);
  const upsertSavedNodePosition = useMapStore((s) => s.upsertSavedNodePosition);
  const openEdgeContextMenu = useMapStore((s) => s.openEdgeContextMenu);
  const closeEdgeContextMenu = useMapStore((s) => s.closeEdgeContextMenu);

  const persistNodePosition = useCallback((node: cytoscape.NodeSingular) => {
    if (!isNodePositionPersistable(useMapStore.getState().nodes, node.id())) {
      return;
    }

    const position = node.position() as SavedNodePosition;
    upsertSavedNodePosition(node.id(), position);
    axios.put(`/api/layout/${node.id()}`, position).catch(() => {
      /* persistence is best-effort */
    });
  }, [upsertSavedNodePosition]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: graphStyles,
      elements: [],
      ...defaultSettings,
    });

    axios
      .get<{
        success: boolean;
        data: Record<string, SavedNodePosition>;
      }>("/api/layout")
      .then(({ data }) => {
        if (data.success && data.data) {
          setSavedNodePositions(data.data);
          // Apply to any nodes already on the graph
          Object.entries(data.data).forEach(([id, pos]) => {
            const n = cy.$id(id);
            if (n.length > 0) n.position(pos);
          });
        }
      })
      .catch(() => {
        /* layout API may not be available yet */
      });

    cy.on("tap", "node", (evt) => {
      const nodeId = evt.target.id();
      closeEdgeContextMenu();

      const state = useMapStore.getState();
      if (state.isConnectionDrawMode) {
        if (!state.pendingConnectionFromNodeId) {
          state.setPendingConnectionFrom(nodeId);
          return;
        }

        if (state.pendingConnectionFromNodeId !== nodeId) {
          state.openConnectionModal({
            fromNodeId: state.pendingConnectionFromNodeId,
            toNodeId: nodeId,
          });
          return;
        }
      }

      setSelectedNode(nodeId);
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        closeEdgeContextMenu();
        setSelectedNode(null);
      }
    });

    cy.on("cxttap", "edge", (evt) => {
      evt.preventDefault();
      const rendered = evt.renderedPosition;
      openEdgeContextMenu({
        edgeId: evt.target.id(),
        x: rendered.x,
        y: rendered.y,
      });
    });

    cy.on("dragfree", "node", (evt) => {
      persistNodePosition(evt.target);
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [
    closeEdgeContextMenu,
    openEdgeContextMenu,
    persistNodePosition,
    setSavedNodePositions,
    setSelectedNode,
  ]);

  // Sync nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const existingIds = new Set(cy.nodes().map((n) => n.id()));
    const storeIds = new Set(nodes.map((n) => n.id));

    cy.nodes().forEach((n) => {
      if (!storeIds.has(n.id())) cy.remove(n);
    });

    let shouldRunLayout = false;

    nodes.forEach((n) => {
      if (!existingIds.has(n.id)) {
        const saved = savedNodePositions[n.id];
        cy.add({
          group: "nodes",
          data: {
            id: n.id,
            label: n.label,
            zoneType: n.zoneType,
            tier: n.tier,
            icon: getPrimaryZoneIcon(n.zone),
          },
          position: saved ? { x: saved.x, y: saved.y } : undefined,
        });
        if (!saved && !(n.source === "route" && routePath.includes(n.id))) {
          shouldRunLayout = true;
        }
      }
    });

    if (shouldRunLayout) {
      const layout = cy.layout(defaultSettings.layout as cytoscape.LayoutOptions);
      layout.one("layoutstop", () => {
        cy.nodes().forEach((node) => {
          persistNodePosition(node);
        });
      });
      layout.run();
    }
  }, [nodes, persistNodePosition, routePath, savedNodePositions]);

  // Sync edges
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const existingIds = new Set(cy.edges().map((e) => e.id()));
    const storeIds = new Set(edges.map((e) => e.id));

    cy.edges().forEach((e) => {
      if (!storeIds.has(e.id())) cy.remove(e);
    });

    edges.forEach((e) => {
      if (!existingIds.has(e.id)) {
        if (cy.$id(e.source).length > 0 && cy.$id(e.target).length > 0) {
          const elem = cy.add({
            group: "edges",
            data: {
              id: e.id,
              source: e.source,
              target: e.target,
              connType: e.connType,
              label: e.label,
            },
          });
          if (e.durationHours) elem.addClass("timed");
        }
      } else {
        const elem = cy.$id(e.id);
        elem.data({
          ...elem.data(),
          connType: e.connType,
          label: e.label,
        });
        elem.toggleClass("timed", Boolean(e.durationHours));
        elem.toggleClass(
          "time-low",
          Boolean(e.expiresAt && new Date(e.expiresAt).getTime() - Date.now() < 60 * 60_000)
        );
      }
    });
  }, [edges, nodes]);

  // Selected highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedNodeId) cy.$id(selectedNodeId).addClass("selected");
  }, [selectedNodeId]);

  // Draw-mode source highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("connection-source");
    if (isConnectionDrawMode && pendingConnectionFromNodeId) {
      cy.$id(pendingConnectionFromNodeId).addClass("connection-source");
    }
  }, [isConnectionDrawMode, pendingConnectionFromNodeId]);

  // Current zone highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("current-zone");
    if (currentZoneId) cy.$id(currentZoneId).addClass("current-zone");
  }, [currentZoneId]);

  // Route highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.edges("[isRouteVisual]").remove();

    let routeVisualEdgeCount = 0;
    for (const edge of routePathToVisualEdges(routePath, edges)) {
      if (cy.$id(edge.source).length > 0 && cy.$id(edge.target).length > 0) {
        cy.add({
          group: "edges",
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            connType: edge.connType,
            label: edge.label,
            isRouteVisual: true,
          },
        }).addClass("route-edge");
        routeVisualEdgeCount += 1;
      }
    }

    cy.nodes().removeClass("route-node dimmed");
    cy.edges(":not([isRouteVisual])").removeClass("route-edge");
    if (routePath.length > 0) {
      cy.nodes().addClass("dimmed");
      routePath.forEach((id) => {
        cy.$id(id).removeClass("dimmed").addClass("route-node");
      });
      for (let index = 0; index < routePath.length - 1; index += 1) {
        const from = routePath[index];
        const to = routePath[index + 1];
        cy.edges()
          .filter((edge) => {
            const source = edge.data("source") as string;
            const target = edge.data("target") as string;
            return (source === from && target === to) || (source === to && target === from);
          })
          .addClass("route-edge");
      }
    }

    if (shouldLayoutAfterRouteVisualEdges(routeVisualEdgeCount)) {
      cy.layout(defaultSettings.layout as cytoscape.LayoutOptions).run();
    }
  }, [edges, nodes, routePath]);

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", background: "#0d0d1a" }}
      />
      <ConnectionToolbar />
      <EdgeContextMenu />
      <AddConnectionModal />
    </div>
  );
}
