import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { ApiResponse, Connection, Zone } from "@ao-mapper/shared";
import { useMapStore } from "../store/mapStore";
import type { SavedNodePosition } from "../store/mapStore";
import { useConnectionRealtime } from "./useConnectionRealtime";
import { useConnectionTimers } from "./useConnectionTimers";
import { zoneToNode } from "../components/zonePresentation";

export interface PersistedLayoutNode {
  zone: Zone;
  position: SavedNodePosition;
}

export function getConnectionZoneIds(connections: Connection[]): string[] {
  return Array.from(
    new Set(connections.flatMap((connection) => [connection.fromZoneId, connection.toZoneId]))
  );
}

export async function fetchZonesByIds(zoneIds: string[]): Promise<Zone[]> {
  const results = await Promise.allSettled(
    zoneIds.map(async (zoneId) => {
      const { data } = await axios.get<ApiResponse<Zone>>(`/api/zones/${zoneId}`);
      return data.success && data.data ? data.data : null;
    })
  );
  return results
    .filter(
      (result): result is PromiseFulfilledResult<Zone | null> =>
        result.status === "fulfilled"
    )
    .map((result) => result.value)
    .filter((zone): zone is Zone => zone !== null);
}

export function layoutNodesToPositionMap(
  layoutNodes: PersistedLayoutNode[]
): Record<string, SavedNodePosition> {
  return Object.fromEntries(
    layoutNodes.map((layoutNode) => [layoutNode.zone.id, layoutNode.position])
  );
}

export function useConnections() {
  const loadConnections = useMapStore((s) => s.loadConnections);
  const addRouteNodes = useMapStore((s) => s.addRouteNodes);
  useConnectionRealtime();
  useConnectionTimers();

  return useQuery<Connection[]>({
    queryKey: ["connections"],
    queryFn: async (): Promise<Connection[]> => {
      const { data } = await axios.get<ApiResponse<Connection[]>>(
        "/api/connections"
      );
      if (data.success && data.data) {
        loadConnections(data.data);
        const zones = await fetchZonesByIds(getConnectionZoneIds(data.data));
        addRouteNodes(zones.map((zone) => zoneToNode(zone)));
        return data.data;
      }
      return [];
    },
    refetchInterval: 60_000,
  });
}

export function usePersistedLayoutNodes() {
  const addRouteNodes = useMapStore((s) => s.addRouteNodes);
  const setSavedNodePositions = useMapStore((s) => s.setSavedNodePositions);

  return useQuery<PersistedLayoutNode[]>({
    queryKey: ["layout", "nodes"],
    queryFn: async (): Promise<PersistedLayoutNode[]> => {
      const { data } = await axios.get<ApiResponse<PersistedLayoutNode[]>>(
        "/api/layout/nodes"
      );
      if (data.success && data.data) {
        setSavedNodePositions(layoutNodesToPositionMap(data.data));
        addRouteNodes(data.data.map((layoutNode) => zoneToNode(layoutNode.zone)));
        return data.data;
      }
      return [];
    },
    staleTime: 30_000,
  });
}

export function useZoneSearch(query: string) {
  const trimmedQuery = query.trim();

  return useQuery<Zone[]>({
    queryKey: ["zones", "search", trimmedQuery],
    enabled: trimmedQuery.length >= 2,
    queryFn: async (): Promise<Zone[]> => {
      const { data } = await axios.get<ApiResponse<Zone[]>>(
        "/api/zones/search",
        { params: { q: trimmedQuery } }
      );
      if (data.success && data.data) {
        return data.data;
      }
      throw new Error(data.error ?? "Zone search failed");
    },
    staleTime: 30_000,
  });
}

export function useRemoveZone() {
  const queryClient = useQueryClient();
  const removeNode = useMapStore((s) => s.removeNode);
  const edges = useMapStore((s) => s.edges);

  return useMutation({
    mutationFn: async (zoneId: string) => {
      const connectedEdges = edges.filter(
        (edge) => edge.source === zoneId || edge.target === zoneId
      );

      const results = await Promise.allSettled([
        ...connectedEdges.map((edge) => axios.delete(`/api/connections/${edge.id}`)),
        axios.delete(`/api/layout/${zoneId}`),
      ]);
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) {
        throw new Error("Failed to remove the zone from the persisted map");
      }
    },
    onSuccess: (_result, zoneId) => {
      removeNode(zoneId);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}
