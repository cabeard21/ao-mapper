import type { Server as HttpServer } from "http";
import { attachWebSocketServer, type RealtimeWebSocketServer } from "./server";
import type { RealtimeEvent } from "./types";

let realtimeServer: RealtimeWebSocketServer | null = null;

export function startRealtimeServer(httpServer: HttpServer): RealtimeWebSocketServer {
  realtimeServer = attachWebSocketServer(httpServer);
  return realtimeServer;
}

export function broadcastRealtimeEvent(event: RealtimeEvent): void {
  realtimeServer?.broadcast(event);
}

export function getRealtimeServer(): RealtimeWebSocketServer | null {
  return realtimeServer;
}
