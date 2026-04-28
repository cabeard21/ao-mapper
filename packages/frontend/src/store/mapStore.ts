import { create } from "zustand";
import type {
  Connection,
  ConnectionType,
  Zone,
  ZoneType,
} from "@ao-mapper/shared";
import { formatConnectionLabel } from "../hooks/timerLabels";

export interface CytoNode {
  id: string;
  label: string;
  zoneType: ZoneType;
  tier: number;
  zone: Zone;
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

export interface PendingConnection {
  fromNodeId: string;
  toNodeId: string;
  edgeId?: string;
}

export interface EdgeContextMenuState {
  edgeId: string;
  x: number;
  y: number;
}

interface MapState {
  nodes: CytoNode[];
  edges: CytoEdge[];
  selectedNodeId: string | null;
  currentZoneId: string | null;
  routePath: string[];
  isConnectionDrawMode: boolean;
  pendingConnectionFromNodeId: string | null;
  connectionModal: PendingConnection | null;
  edgeContextMenu: EdgeContextMenuState | null;

  addNode: (node: CytoNode) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  setNodes: (nodes: CytoNode[]) => void;
  addEdge: (edge: CytoEdge) => void;
  upsertEdge: (edge: CytoEdge) => void;
  removeEdge: (id: string) => void;
  setEdges: (edges: CytoEdge[]) => void;
  setSelectedNode: (id: string | null) => void;
  setCurrentZone: (id: string | null) => void;
  setRoutePath: (path: string[]) => void;
  loadConnections: (connections: Connection[]) => void;
  refreshEdgeLabels: (now?: Date) => void;
  setConnectionDrawMode: (enabled: boolean) => void;
  setPendingConnectionFrom: (id: string | null) => void;
  openConnectionModal: (connection: PendingConnection) => void;
  closeConnectionModal: () => void;
  openEdgeContextMenu: (menu: EdgeContextMenuState) => void;
  closeEdgeContextMenu: () => void;
}

export function connectionToEdge(connection: Connection, now = new Date()): CytoEdge {
  return {
    id: connection.id,
    source: connection.fromZoneId,
    target: connection.toZoneId,
    connType: connection.connType,
    label: formatConnectionLabel(connection, now),
    durationHours: connection.durationHours,
    expiresAt: connection.expiresAt,
  };
}

export const useMapStore = create<MapState>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  currentZoneId: null,
  routePath: [],
  isConnectionDrawMode: false,
  pendingConnectionFromNodeId: null,
  connectionModal: null,
  edgeContextMenu: null,

  addNode: (node) =>
    set((s) => {
      if (s.nodes.some((n) => n.id === node.id)) {
        return {
          nodes: s.nodes.map((n) => (n.id === node.id ? node : n)),
          selectedNodeId: node.id,
        };
      }
      return { nodes: [...s.nodes, node], selectedNodeId: node.id };
    }),
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      currentZoneId: s.currentZoneId === id ? null : s.currentZoneId,
      routePath: s.routePath.filter((zoneId) => zoneId !== id),
      pendingConnectionFromNodeId:
        s.pendingConnectionFromNodeId === id ? null : s.pendingConnectionFromNodeId,
    })),
  removeNodes: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      return {
        nodes: s.nodes.filter((n) => !idSet.has(n.id)),
        edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
        selectedNodeId:
          s.selectedNodeId && idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
        currentZoneId:
          s.currentZoneId && idSet.has(s.currentZoneId) ? null : s.currentZoneId,
        routePath: s.routePath.filter((zoneId) => !idSet.has(zoneId)),
      };
    }),
  setNodes: (nodes) => set({ nodes }),
  addEdge: (edge) => set((s) => ({ edges: [...s.edges, edge] })),
  upsertEdge: (edge) =>
    set((s) => {
      const exists = s.edges.some((existing) => existing.id === edge.id);
      return {
        edges: exists
          ? s.edges.map((existing) => (existing.id === edge.id ? edge : existing))
          : [...s.edges, edge],
      };
    }),
  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  setEdges: (edges) => set({ edges }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setCurrentZone: (id) => set({ currentZoneId: id }),
  setRoutePath: (path) => set({ routePath: path }),

  loadConnections: (connections) => {
    const now = new Date();
    const edges: CytoEdge[] = connections.map((c) => connectionToEdge(c, now));
    set({ edges });
  },
  refreshEdgeLabels: (now = new Date()) =>
    set((s) => ({
      edges: s.edges.map((edge) => ({
        ...edge,
        label: formatConnectionLabel(edge, now),
      })),
    })),
  setConnectionDrawMode: (enabled) =>
    set({
      isConnectionDrawMode: enabled,
      pendingConnectionFromNodeId: null,
      edgeContextMenu: null,
    }),
  setPendingConnectionFrom: (id) => set({ pendingConnectionFromNodeId: id }),
  openConnectionModal: (connection) =>
    set({
      connectionModal: connection,
      isConnectionDrawMode: false,
      pendingConnectionFromNodeId: null,
      edgeContextMenu: null,
    }),
  closeConnectionModal: () => set({ connectionModal: null }),
  openEdgeContextMenu: (menu) => set({ edgeContextMenu: menu }),
  closeEdgeContextMenu: () => set({ edgeContextMenu: null }),
}));
