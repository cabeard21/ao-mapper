import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { ApiResponse, Connection, ConnectionType } from "@ao-mapper/shared";
import { connectionToEdge, useMapStore } from "../store/mapStore";

export interface ConnectionFormValues {
  fromZoneId: string;
  toZoneId: string;
  connType: ConnectionType;
  durationHours: number | null;
}

interface UpdateConnectionValues {
  id: string;
  connType: ConnectionType;
  durationHours: number | null;
}

function unwrapConnection(response: ApiResponse<Connection>): Connection {
  if (!response.success || !response.data) {
    throw new Error(response.error ?? "Connection request failed");
  }
  return response.data;
}

export function useConnectionActions() {
  const queryClient = useQueryClient();
  const upsertEdge = useMapStore((s) => s.upsertEdge);
  const removeEdge = useMapStore((s) => s.removeEdge);

  const refreshConnections = () => {
    void queryClient.invalidateQueries({ queryKey: ["connections"] });
  };

  const createConnection = useMutation({
    mutationFn: async (values: ConnectionFormValues) => {
      const payload = {
        fromZoneId: values.fromZoneId,
        toZoneId: values.toZoneId,
        connType: values.connType,
        durationHours: values.durationHours,
      };
      const { data } = await axios.post<ApiResponse<Connection>>(
        "/api/connections",
        payload
      );
      return unwrapConnection(data);
    },
    onSuccess: (connection) => {
      upsertEdge(connectionToEdge(connection));
      refreshConnections();
    },
  });

  const updateConnection = useMutation({
    mutationFn: async (values: UpdateConnectionValues) => {
      const { data } = await axios.patch<ApiResponse<Connection>>(
        `/api/connections/${values.id}`,
        {
          connType: values.connType,
          durationHours: values.durationHours,
        }
      );
      return unwrapConnection(data);
    },
    onSuccess: (connection) => {
      upsertEdge(connectionToEdge(connection));
      refreshConnections();
    },
  });

  const deleteConnection = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/connections/${id}`);
      return id;
    },
    onSuccess: (id) => {
      removeEdge(id);
      refreshConnections();
    },
  });

  return {
    createConnection,
    updateConnection,
    deleteConnection,
  };
}

