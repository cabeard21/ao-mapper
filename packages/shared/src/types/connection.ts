export type ConnectionType = "PORTAL_7" | "PORTAL_20";

export interface OcrResult {
  toZone: { id: string; uniqueName: string; displayName: string };
  connType: ConnectionType;
  closesInMinutes: number;
}

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
