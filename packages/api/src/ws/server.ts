import type { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import type { RealtimeEvent } from "./types";

export class RealtimeWebSocketServer {
  private readonly wss: WebSocketServer;

  constructor(httpServer: HttpServer, path = "/ws") {
    this.wss = new WebSocketServer({ server: httpServer, path });

    this.wss.on("connection", (socket) => {
      socket.on("message", (message) => {
        if (message.toString() === "ping" && socket.readyState === WebSocket.OPEN) {
          socket.send("pong");
        }
      });
    });
  }

  broadcast(event: RealtimeEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  close(): Promise<void> {
    for (const client of this.wss.clients) {
      client.close();
    }

    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}

export function attachWebSocketServer(httpServer: HttpServer): RealtimeWebSocketServer {
  return new RealtimeWebSocketServer(httpServer);
}
