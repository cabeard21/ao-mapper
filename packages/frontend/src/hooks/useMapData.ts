import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { ApiResponse, Connection } from "@ao-mapper/shared";
import { useMapStore } from "../store/mapStore";

export function useConnections() {
  const loadConnections = useMapStore((s) => s.loadConnections);

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
