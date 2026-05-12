import { create } from "zustand";
import type {
  Connection,
  ConnectionType,
  OcrResult,
  RouteResult,
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
  connType: ConnectionType | "STATIC";
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

export interface NodeContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

export type ViewportCommand =
  | { type: "fit" }
  | { type: "center"; nodeId: string };

interface MapState {
  nodes: CytoNode[];
  edges: CytoEdge[];
  staticEdges: CytoEdge[];
  savedNodePositions: Record<string, SavedNodePosition>;
  selectedNodeId: string | null;
  currentZoneId: string | null;
  homeZoneId: string | null;
  routePlannerFromZone: Zone | null;
  routePlannerToZone: Zone | null;
  routePlannerActiveRoute: RouteResult | null;
  isFollowingCurrentZone: boolean;
  routePath: string[];
  isConnectionDrawMode: boolean;
  pendingConnectionFromNodeId: string | null;
  connectionModal: PendingConnection | null;
  edgeContextMenu: EdgeContextMenuState | null;
  nodeContextMenu: NodeContextMenuState | null;
  viewportCommand: ViewportCommand | null;
  pendingOcrResult: OcrResult | null;

  addNode: (node: CytoNode) => void;
  addRouteNodes: (nodes: CytoNode[]) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  pruneIsolatedNodes: (exceptNodeId?: string) => void;
  setNodes: (nodes: CytoNode[]) => void;
  setSavedNodePositions: (positions: Record<string, SavedNodePosition>) => void;
  upsertSavedNodePosition: (id: string, position: SavedNodePosition) => void;
  setStaticEdges: (edges: CytoEdge[]) => void;
  addEdge: (edge: CytoEdge) => void;
  upsertEdge: (edge: CytoEdge) => void;
  removeEdge: (id: string) => void;
  setEdges: (edges: CytoEdge[]) => void;
  setSelectedNode: (id: string | null) => void;
  setCurrentZone: (id: string | null) => void;
  setHomeZoneId: (id: string | null) => void;
  setRoutePlannerFromZone: (zone: Zone | null) => void;
  setRoutePlannerToZone: (zone: Zone | null) => void;
  setRoutePlannerActiveRoute: (route: RouteResult | null) => void;
  swapRoutePlannerZones: () => void;
  clearRoutePlannerZones: () => void;
  setFollowingCurrentZone: (enabled: boolean) => void;
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
  openNodeContextMenu: (menu: NodeContextMenuState) => void;
  closeNodeContextMenu: () => void;
  triggerViewport: (cmd: ViewportCommand) => void;
  clearViewportCommand: () => void;
  setPendingOcrResult: (result: OcrResult | null) => void;
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

export const useMapStore = create<MapState>((set, get) => ({
  nodes: [],
  edges: [],
  staticEdges: [],
  savedNodePositions: {},
  selectedNodeId: null,
  currentZoneId: null,
  homeZoneId: null,
  routePlannerFromZone: null,
  routePlannerToZone: null,
  routePlannerActiveRoute: null,
  isFollowingCurrentZone: false,
  routePath: [],
  isConnectionDrawMode: false,
  pendingConnectionFromNodeId: null,
  connectionModal: null,
  edgeContextMenu: null,
  nodeContextMenu: null,
  viewportCommand: null,
  pendingOcrResult: null,

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
  pruneIsolatedNodes: (exceptNodeId?: string) => {
    const s = get();
    const connectedNodeIds = new Set<string>();
    for (const edge of s.edges) {
      if (edge.isRouteVisual) continue;
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    const protected_ = new Set<string>(
      [s.currentZoneId, s.homeZoneId, exceptNodeId, ...s.routePath].filter(
        (id): id is string => id != null
      )
    );

    const toRemove = s.nodes.filter(
      (node) => !connectedNodeIds.has(node.id) && !protected_.has(node.id)
    );

    if (toRemove.length === 0) return;

    const manualIdsToRemove = toRemove
      .filter((node) => node.source === "manual")
      .map((node) => node.id);

    for (const id of manualIdsToRemove) {
      fetch(`/api/layout/${id}`, { method: "DELETE" }).catch(() => {
        /* best-effort */
      });
    }

    set((s2) => {
      const idSet = new Set(toRemove.map((n) => n.id));
      const savedNodePositions = Object.fromEntries(
        Object.entries(s2.savedNodePositions).filter(([id]) => !idSet.has(id))
      );
      return {
        nodes: s2.nodes.filter((n) => !idSet.has(n.id)),
        edges: s2.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
        savedNodePositions,
        selectedNodeId:
          s2.selectedNodeId && idSet.has(s2.selectedNodeId) ? null : s2.selectedNodeId,
        currentZoneId:
          s2.currentZoneId && idSet.has(s2.currentZoneId) ? null : s2.currentZoneId,
        routePath: s2.routePath.filter((zoneId) => !idSet.has(zoneId)),
        pendingConnectionFromNodeId:
          s2.pendingConnectionFromNodeId && idSet.has(s2.pendingConnectionFromNodeId)
            ? null
            : s2.pendingConnectionFromNodeId,
        connectionModal:
          s2.connectionModal &&
          (idSet.has(s2.connectionModal.fromNodeId) || idSet.has(s2.connectionModal.toNodeId))
            ? null
            : s2.connectionModal,
        nodeContextMenu:
          s2.nodeContextMenu && idSet.has(s2.nodeContextMenu.nodeId)
            ? null
            : s2.nodeContextMenu,
      };
    });
  },
  setNodes: (nodes) => set({ nodes }),
  setSavedNodePositions: (positions) => set({ savedNodePositions: positions }),
  upsertSavedNodePosition: (id, position) =>
    set((s) => ({
      savedNodePositions: {
        ...s.savedNodePositions,
        [id]: position,
      },
    })),
  setStaticEdges: (edges) => set({ staticEdges: edges }),
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
  setHomeZoneId: (id) => set({ homeZoneId: id }),
  setRoutePlannerFromZone: (zone) =>
    set({ routePlannerFromZone: zone, routePlannerActiveRoute: null }),
  setRoutePlannerToZone: (zone) =>
    set({ routePlannerToZone: zone, routePlannerActiveRoute: null }),
  setRoutePlannerActiveRoute: (route) => set({ routePlannerActiveRoute: route }),
  swapRoutePlannerZones: () =>
    set((s) => ({
      routePlannerFromZone: s.routePlannerToZone,
      routePlannerToZone: s.routePlannerFromZone,
      routePlannerActiveRoute: null,
    })),
  clearRoutePlannerZones: () =>
    set({
      routePlannerFromZone: null,
      routePlannerToZone: null,
      routePlannerActiveRoute: null,
    }),
  setFollowingCurrentZone: (enabled) => set({ isFollowingCurrentZone: enabled }),
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
      edges: s.edges.map((edge) => {
        const { connType, durationHours, expiresAt } = edge;
        if (connType === "STATIC") return edge;
        return { ...edge, label: formatConnectionLabel({ connType, durationHours, expiresAt }, now) };
      }),
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
  openNodeContextMenu: (menu) => set({ nodeContextMenu: menu }),
  closeNodeContextMenu: () => set({ nodeContextMenu: null }),
  triggerViewport: (cmd) => set({ viewportCommand: cmd }),
  clearViewportCommand: () => set({ viewportCommand: null }),
  setPendingOcrResult: (result) => set({ pendingOcrResult: result }),
}));
