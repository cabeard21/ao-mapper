import { useEffect } from "react";
import axios from "axios";
import type { ApiResponse, Connection, Zone } from "@ao-mapper/shared";
import { zoneToNode } from "../components/zonePresentation";
import { connectionToEdge, useMapStore } from "../store/mapStore";

type ConnectionEvent =
  | {
      type: "connection:created" | "connection:updated";
      connection?: Connection;
      data?: Connection | { connection?: Connection };
    }
  | {
      type: "connection:deleted" | "connection:expired";
      id?: string;
      connectionId?: string;
      connectionIds?: string[];
      data?: string | { id?: string; connectionId?: string; connectionIds?: string[] };
    };

type ZoneCurrentEvent = {
  type: "zone:current";
  zoneId: string | null;
  uniqueName: string;
  displayName?: string;
};

type RealtimeEvent = ConnectionEvent | ZoneCurrentEvent;

function getWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function extractConnection(event: ConnectionEvent): Connection | null {
  if ("connection" in event && event.connection) return event.connection;
  if (event.data && typeof event.data === "object" && "connection" in event.data) {
    return event.data.connection ?? null;
  }
  if (event.data && typeof event.data === "object" && "id" in event.data) {
    return event.data as Connection;
  }
  return null;
}

function extractConnectionId(event: ConnectionEvent): string | null {
  if ("id" in event && event.id) return event.id;
  if ("connectionId" in event && event.connectionId) return event.connectionId;
  if (typeof event.data === "string") return event.data;
  if (event.data && typeof event.data === "object") {
    if ("connectionId" in event.data && event.data.connectionId) {
      return event.data.connectionId;
    }
    if ("id" in event.data && event.data.id) {
      return event.data.id;
    }
  }
  return null;
}

function extractConnectionIds(event: ConnectionEvent): string[] {
  if ("connectionIds" in event && event.connectionIds) return event.connectionIds;
  const singleId = extractConnectionId(event);
  if (singleId) return [singleId];
  if (event.data && typeof event.data === "object" && "connectionIds" in event.data) {
    return event.data.connectionIds ?? [];
  }
  return [];
}

export function useConnectionRealtime() {
  const upsertEdge = useMapStore((s) => s.upsertEdge);
  const removeEdge = useMapStore((s) => s.removeEdge);
  const addNode = useMapStore((s) => s.addNode);
  const setCurrentZone = useMapStore((s) => s.setCurrentZone);
  const setSelectedNode = useMapStore((s) => s.setSelectedNode);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByHook = false;

    const connect = () => {
      socket = new WebSocket(getWebSocketUrl());

      socket.onmessage = async (message) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(message.data) as RealtimeEvent;
        } catch {
          return;
        }

        if (event.type === "connection:created" || event.type === "connection:updated") {
          const connection = extractConnection(event);
          if (connection) upsertEdge(connectionToEdge(connection));
          return;
        }

        if (event.type === "connection:deleted" || event.type === "connection:expired") {
          for (const id of extractConnectionIds(event)) {
            removeEdge(id);
          }
          return;
        }

        if (event.type === "zone:current") {
          if (!event.zoneId) {
            return;
          }

          const existingNode = useMapStore
            .getState()
            .nodes.find((node) => node.id === event.zoneId);
          if (existingNode) {
            setCurrentZone(event.zoneId);
            setSelectedNode(event.zoneId);
            return;
          }

          try {
            const { data } = await axios.get<ApiResponse<Zone>>(`/api/zones/${event.zoneId}`);
            if (data.success && data.data) {
              addNode(zoneToNode(data.data));
              setCurrentZone(data.data.id);
              setSelectedNode(data.data.id);
            }
          } catch {
            setCurrentZone(event.zoneId);
            setSelectedNode(event.zoneId);
          }
        }
      };

      socket.onclose = () => {
        if (!closedByHook) {
          reconnectTimer = window.setTimeout(connect, 2_000);
        }
      };
    };

    connect();

    return () => {
      closedByHook = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [addNode, removeEdge, setCurrentZone, setSelectedNode, upsertEdge]);
}
