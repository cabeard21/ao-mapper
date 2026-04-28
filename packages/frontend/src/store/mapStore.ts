import { create } from "zustand";
import type { Connection, ConnectionType, ZoneType } from "@ao-mapper/shared";

export interface CytoNode {
  id: string;
  label: string;
  zoneType: ZoneType;
  tier: number;
}

export interface CytoEdge {
  id: string;
  source: string;
  target: string;
  connType: ConnectionType;
  label: string;
  durationHours: number | null;
  expiresAt: string | null;
}

interface MapState {
  nodes: CytoNode[];
  edges: CytoEdge[];
  selectedNodeId: string | null;
  currentZoneId: string | null;
  routePath: string[];

  addNode: (node: CytoNode) => void;
  removeNode: (id: string) => void;
  setNodes: (nodes: CytoNode[]) => void;
  addEdge: (edge: CytoEdge) => void;
  removeEdge: (id: string) => void;
  setEdges: (edges: CytoEdge[]) => void;
  setSelectedNode: (id: string | null) => void;
  setCurrentZone: (id: string | null) => void;
  setRoutePath: (path: string[]) => void;
  loadConnections: (connections: Connection[]) => void;
}

export const useMapStore = create<MapState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  currentZoneId: null,
  routePath: [],

  addNode: (node) => set((s) => ({ nodes: [...s.nodes, node] })),
  removeNode: (id) =>
    set((s) => ({ nodes: s.nodes.filter((n) => n.id !== id) })),
  setNodes: (nodes) => set({ nodes }),
  addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),
  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setCurrentZone: (id) => set({ currentZoneId: id }),
  setRoutePath: (path) => set({ routePath: path }),

  loadConnections: (connections) => {
    const edges: CytoEdge[] = connections.map((c) => ({
      id: c.id,
      source: c.fromZoneId,
      target: c.toZoneId,
      connType: c.connType,
      label: c.durationHours ? `${c.durationHours}h` : "",
      durationHours: c.durationHours,
      expiresAt: c.expiresAt,
    }));
    set({ edges });
  },
}));
