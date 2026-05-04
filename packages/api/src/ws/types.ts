import type { Connection, ConnectionType } from "@ao-mapper/shared";

export interface ZoneLookupResult {
  id: string;
  uniqueName: string;
  displayName: string;
}

export type RealtimeEvent =
  | { type: "connection:created"; connection: Connection }
  | { type: "connection:updated"; connection: Connection }
  | { type: "connection:deleted"; connectionId: string }
  | { type: "connection:expired"; connectionIds: string[] }
  | {
      type: "zone:current";
      zoneId: string | null;
      uniqueName: string;
      displayName?: string;
    }
  | { type: "route:updated" }
  | {
      type: "ocr:result";
      toZone: ZoneLookupResult;
      connType: ConnectionType;
      closesInMinutes: number;
    };
