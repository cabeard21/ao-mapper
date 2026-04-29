import { WebSocket } from "ws";
import type { Pool } from "pg";
import { extractCurrentZoneUniqueName, parseSnifferMessage } from "./photonMapper";
import { broadcastRealtimeEvent } from "./realtime";
import type { ZoneLookupResult } from "./types";

const DEFAULT_SNIFFER_WS_URL = "ws://127.0.0.1:10001/ws";
const DEFAULT_RECONNECT_MS = 5_000;

export class SnifferClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly pool: Pool,
    private readonly url = process.env.SNIFFER_WS_URL ?? DEFAULT_SNIFFER_WS_URL,
    private readonly reconnectMs = DEFAULT_RECONNECT_MS
  ) {}

  start(): void {
    this.stopped = false;
    console.log(`[Sniffer] Connecting to ${this.url}`);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.on("open", () => {
      console.log(`Sniffer connected on ${this.url}`);
    });

    socket.on("message", async (data) => {
      await this.handleMessage(data.toString());
    });

    socket.on("error", (err) => {
      console.warn(`[Sniffer] Unable to connect to ${this.url}: ${err.message}`);
    });

    socket.on("close", () => {
      if (!this.stopped) {
        console.warn(`[Sniffer] Connection closed; retrying in ${this.reconnectMs}ms`);
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectMs);
  }

  private async handleMessage(rawMessage: string): Promise<void> {
    const message = parseSnifferMessage(rawMessage);
    if (!message) {
      return;
    }

    const uniqueName = extractCurrentZoneUniqueName(message);
    if (!uniqueName) {
      return;
    }

    console.log(`[Sniffer] Current zone received: ${uniqueName}`);
    const zone = await this.findZoneByUniqueName(uniqueName);
    if (!zone) {
      console.warn(`[Sniffer] Current zone not found in database: ${uniqueName}`);
      broadcastRealtimeEvent({ type: "zone:current", zoneId: null, uniqueName });
      return;
    }

    console.log(`[Sniffer] Current zone matched: ${zone.displayName} (${zone.id})`);
    broadcastRealtimeEvent({
      type: "zone:current",
      zoneId: zone.id,
      uniqueName: zone.uniqueName,
      displayName: zone.displayName,
    });
  }

  private async findZoneByUniqueName(uniqueName: string): Promise<ZoneLookupResult | null> {
    const result = await this.pool.query<{
      id: string;
      unique_name: string;
      display_name: string;
    }>(
      `
        SELECT id, unique_name, display_name
        FROM zones
        WHERE unique_name = $1
        LIMIT 1
      `,
      [uniqueName]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      uniqueName: row.unique_name,
      displayName: row.display_name,
    };
  }
}

export function startSnifferClient(pool: Pool): SnifferClient {
  const client = new SnifferClient(pool);
  client.start();
  return client;
}
