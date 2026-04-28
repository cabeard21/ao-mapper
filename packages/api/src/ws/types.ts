import type { Connection } from "@ao-mapper/shared";

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
  | { type: "route:updated" };

export interface ZoneLookupResult {
  id: string;
  uniqueName: string;
  displayName: string;
}
