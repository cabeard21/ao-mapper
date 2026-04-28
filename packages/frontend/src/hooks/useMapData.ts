import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { ApiResponse, Connection, Zone } from "@ao-mapper/shared";
import { useMapStore } from "../store/mapStore";
import { useConnectionRealtime } from "./useConnectionRealtime";
import { useConnectionTimers } from "./useConnectionTimers";

export function useConnections() {
  const loadConnections = useMapStore((s) => s.loadConnections);
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
        return data.data;
      }
      return [];
    },
    refetchInterval: 60_000,
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

      const results = await Promise.allSettled(
        connectedEdges.map((edge) => axios.delete(`/api/connections/${edge.id}`))
      );
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) {
        throw new Error("Failed to remove one or more zone connections");
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
