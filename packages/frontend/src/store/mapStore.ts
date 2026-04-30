import { create } from "zustand";
import type {
  Connection,
  ConnectionType,
  Zone,
  ZoneType,
} from "@ao-mapper/shared";
import { formatConnectionLabel } from "../hooks/timerLabels";

export type NodeSource = "manual" | "sniffed" | "route";

export interface CytoNode {
  id: string;
  label: string;
  source: NodeSource;
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
  isRouteVisual?: boolean;
}

export interface SavedNodePosition {
  x: number;
  y: number;
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
  savedNodePositions: Record<string, SavedNodePosition>;
  selectedNodeId: string | null;
  currentZoneId: string | null;
  routePath: string[];
  isConnectionDrawMode: boolean;
  pendingConnectionFromNodeId: string | null;
  connectionModal: PendingConnection | null;
  edgeContextMenu: EdgeContextMenuState | null;

  addNode: (node: CytoNode) => void;
  addRouteNodes: (nodes: CytoNode[]) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  pruneIsolatedSniffedNodes: (options: { exceptNodeId: string }) => void;
  setNodes: (nodes: CytoNode[]) => void;
  setSavedNodePositions: (positions: Record<string, SavedNodePosition>) => void;
  upsertSavedNodePosition: (id: string, position: SavedNodePosition) => void;
  addEdge: (edge: CytoEdge) => void;
  upsertEdge: (edge: CytoEdge) => void;
  removeEdge: (id: string) => void;
  setEdges: (edges: CytoEdge[]) => void;
  setSelectedNode: (id: string | null) => void;
  setCurrentZone: (id: string | null) => void;
  setRoutePath: (path: string[]) => void;
  clearRoute: () => void;
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

function omitSavedPosition(
  positions: Record<string, SavedNodePosition>,
  idToRemove: string
): Record<string, SavedNodePosition> {
  return Object.fromEntries(
    Object.entries(positions).filter(([id]) => id !== idToRemove)
  );
}

export function isNodePositionPersistable(nodes: CytoNode[], nodeId: string): boolean {
  return nodes.find((node) => node.id === nodeId)?.source === "manual";
}

function edgeConnects(edge: Pick<CytoEdge, "source" | "target">, from: string, to: string): boolean {
  return (edge.source === from && edge.target === to) || (edge.source === to && edge.target === from);
}

export function routePathToVisualEdges(routePath: string[], existingEdges: CytoEdge[]): CytoEdge[] {
  const visualEdges: CytoEdge[] = [];

  for (let index = 0; index < routePath.length - 1; index += 1) {
    const source = routePath[index];
    const target = routePath[index + 1];
    if (existingEdges.some((edge) => edgeConnects(edge, source, target))) {
      continue;
    }

    visualEdges.push({
      id: `route:${source}:${target}`,
      source,
      target,
      connType: "PORTAL_7",
      label: "",
      durationHours: null,
      expiresAt: null,
      isRouteVisual: true,
    });
  }

  return visualEdges;
}

export const useMapStore = create<MapState>((set) => ({
  nodes: [],
  edges: [],
  savedNodePositions: {},
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
          nodes: s.nodes.map((n) =>
            n.id === node.id
              ? {
                  ...node,
                  source:
                    n.source === "manual" || node.source === "manual"
                      ? "manual"
                      : "sniffed",
                }
              : n
          ),
          selectedNodeId: node.id,
        };
      }
      return { nodes: [...s.nodes, node], selectedNodeId: node.id };
    }),
  addRouteNodes: (routeNodes) =>
    set((s) => {
      const routeNodeById = new Map(routeNodes.map((node) => [node.id, node]));
      const existingIds = new Set(s.nodes.map((node) => node.id));
      return {
        nodes: [
          ...s.nodes.map((node) => {
            const routeNode = routeNodeById.get(node.id);
            const source: NodeSource =
              node.source === "manual" || routeNode?.source === "manual"
                ? "manual"
                : node.source === "sniffed" || routeNode?.source === "sniffed"
                  ? "sniffed"
                  : "route";
            return routeNode
              ? {
                  ...routeNode,
                  source,
                }
              : node;
          }),
          ...routeNodes.filter((node) => !existingIds.has(node.id)),
        ],
      };
    }),
  removeNode: (id) =>
    set((s) => {
      const savedNodePositions = omitSavedPosition(s.savedNodePositions, id);
      return {
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        savedNodePositions,
        selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
        currentZoneId: s.currentZoneId === id ? null : s.currentZoneId,
        routePath: s.routePath.filter((zoneId) => zoneId !== id),
        pendingConnectionFromNodeId:
          s.pendingConnectionFromNodeId === id ? null : s.pendingConnectionFromNodeId,
      };
    }),
  removeNodes: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const savedNodePositions = Object.fromEntries(
        Object.entries(s.savedNodePositions).filter(([id]) => !idSet.has(id))
      );
      return {
        nodes: s.nodes.filter((n) => !idSet.has(n.id)),
        edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
        savedNodePositions,
        selectedNodeId:
          s.selectedNodeId && idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
        currentZoneId:
          s.currentZoneId && idSet.has(s.currentZoneId) ? null : s.currentZoneId,
        routePath: s.routePath.filter((zoneId) => !idSet.has(zoneId)),
        pendingConnectionFromNodeId:
          s.pendingConnectionFromNodeId && idSet.has(s.pendingConnectionFromNodeId)
            ? null
            : s.pendingConnectionFromNodeId,
        connectionModal:
          s.connectionModal &&
          (idSet.has(s.connectionModal.fromNodeId) || idSet.has(s.connectionModal.toNodeId))
            ? null
            : s.connectionModal,
      };
    }),
  pruneIsolatedSniffedNodes: ({ exceptNodeId }) =>
    set((s) => {
      const connectedNodeIds = new Set<string>();
      for (const edge of s.edges) {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
      }

      const idsToRemove = s.nodes
        .filter(
          (node) =>
            node.source === "sniffed" &&
            node.id !== exceptNodeId &&
            !connectedNodeIds.has(node.id)
        )
        .map((node) => node.id);

      if (idsToRemove.length === 0) {
        return {};
      }

      const idSet = new Set(idsToRemove);
      const savedNodePositions = Object.fromEntries(
        Object.entries(s.savedNodePositions).filter(([id]) => !idSet.has(id))
      );
      return {
        nodes: s.nodes.filter((n) => !idSet.has(n.id)),
        edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
        savedNodePositions,
        selectedNodeId:
          s.selectedNodeId && idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
        currentZoneId:
          s.currentZoneId && idSet.has(s.currentZoneId) ? null : s.currentZoneId,
        routePath: s.routePath.filter((zoneId) => !idSet.has(zoneId)),
        pendingConnectionFromNodeId:
          s.pendingConnectionFromNodeId && idSet.has(s.pendingConnectionFromNodeId)
            ? null
            : s.pendingConnectionFromNodeId,
        connectionModal:
          s.connectionModal &&
          (idSet.has(s.connectionModal.fromNodeId) || idSet.has(s.connectionModal.toNodeId))
            ? null
            : s.connectionModal,
      };
    }),
  setNodes: (nodes) => set({ nodes }),
  setSavedNodePositions: (positions) => set({ savedNodePositions: positions }),
  upsertSavedNodePosition: (id, position) =>
    set((s) => ({
      savedNodePositions: {
        ...s.savedNodePositions,
        [id]: position,
      },
    })),
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
  clearRoute: () =>
    set((s) => {
      const routeNodeIds = new Set(
        s.nodes.filter((node) => node.source === "route").map((node) => node.id)
      );

      return {
        nodes: s.nodes.filter((node) => node.source !== "route"),
        routePath: [],
        selectedNodeId:
          s.selectedNodeId && routeNodeIds.has(s.selectedNodeId) ? null : s.selectedNodeId,
        currentZoneId:
          s.currentZoneId && routeNodeIds.has(s.currentZoneId) ? null : s.currentZoneId,
      };
    }),

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
