export type ConnectionType =
  | "BZ_PORTAL"
  | "ROYAL_ROAD"
  | "AVALON_ROAD"
  | "TUNNEL"
  | "HIGHWAY";

export interface PortalTimer {
  durationHours: number;
  expiresAt: string;
}

export interface Connection {
  id: string;
  fromZoneId: string;
  toZoneId: string;
  connType: ConnectionType;
  durationHours: number | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
