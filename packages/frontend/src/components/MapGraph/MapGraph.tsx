import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { useEffect, useRef } from "react";
import axios from "axios";
import { useMapStore } from "../../store/mapStore";
import { graphStyles } from "./graphStyles";

cytoscape.use(fcose);

interface SavedPosition {
  x: number;
  y: number;
}

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
  layout: {
    name: "fcose",
    nodeDimensionsIncludeLabels: true,
    idealEdgeLength: 70,
    nestingFactor: 0.5,
    fit: true,
    randomize: true,
    padding: 42,
    animationDuration: 250,
    tilingPaddingVertical: 20,
    tilingPaddingHorizontal: 20,
    nodeRepulsion: 4194304,
    numIter: 2097152,
    uniformNodeDimensions: true,
    quality: "proof",
  } as unknown as cytoscape.LayoutOptions,
};

export function MapGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const savedPositionsRef = useRef<Record<string, SavedPosition>>({});

  const nodes = useMapStore((s) => s.nodes);
  const edges = useMapStore((s) => s.edges);
  const selectedNodeId = useMapStore((s) => s.selectedNodeId);
  const currentZoneId = useMapStore((s) => s.currentZoneId);
  const routePath = useMapStore((s) => s.routePath);
  const setSelectedNode = useMapStore((s) => s.setSelectedNode);

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
        data: Record<string, SavedPosition>;
      }>("/api/layout")
      .then(({ data }) => {
        if (data.success && data.data) {
          savedPositionsRef.current = data.data;
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
      setSelectedNode(evt.target.id());
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) setSelectedNode(null);
    });

    cy.on("dragfree", "node", (evt) => {
      const node = evt.target;
      const pos = node.position();
      savedPositionsRef.current[node.id()] = { x: pos.x, y: pos.y };
      axios.put(`/api/layout/${node.id()}`, pos).catch(() => {
        /* persistence is best-effort */
      });
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [setSelectedNode]);

  // Sync nodes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const existingIds = new Set(cy.nodes().map((n) => n.id()));
    const storeIds = new Set(nodes.map((n) => n.id));

    cy.nodes().forEach((n) => {
      if (!storeIds.has(n.id())) cy.remove(n);
    });

    nodes.forEach((n) => {
      if (!existingIds.has(n.id)) {
        const saved = savedPositionsRef.current[n.id];
        cy.add({
          group: "nodes",
          data: {
            id: n.id,
            label: n.label,
            zoneType: n.zoneType,
            tier: n.tier,
          },
          position: saved ? { x: saved.x, y: saved.y } : undefined,
        });
      }
    });
  }, [nodes]);

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
      }
    });
  }, [edges]);

  // Selected highlight
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("selected");
    if (selectedNodeId) cy.$id(selectedNodeId).addClass("selected");
  }, [selectedNodeId]);

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
    cy.nodes().removeClass("route-node dimmed");
    cy.edges().removeClass("route-edge");
    if (routePath.length > 0) {
      cy.nodes().addClass("dimmed");
      routePath.forEach((id) => {
        cy.$id(id).removeClass("dimmed").addClass("route-node");
      });
    }
  }, [routePath]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", background: "#0d0d1a" }}
    />
  );
}
