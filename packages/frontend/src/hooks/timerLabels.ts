import type { ConnectionType } from "@ao-mapper/shared";

interface TimedConnectionLike {
  connType: ConnectionType;
  durationHours: number | null;
  expiresAt: string | null;
}

const typeLabels: Record<ConnectionType, string> = {
  BZ_PORTAL: "BZ",
  ROYAL_ROAD: "Royal",
  AVALON_ROAD: "Avalon",
  TUNNEL: "Tunnel",
  HIGHWAY: "Highway",
};

export function formatRemainingTime(expiresAt: string | null, now = new Date()): string {
  if (!expiresAt) return "";

  const expiresAtMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) return "";

  const remainingMs = expiresAtMs - now.getTime();
  if (remainingMs <= 0) return "expired";

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function formatConnectionLabel(
  connection: TimedConnectionLike,
  now = new Date()
): string {
  const typeLabel = typeLabels[connection.connType] ?? connection.connType;
  const remaining = formatRemainingTime(connection.expiresAt, now);

  if (!connection.durationHours || !connection.expiresAt) return typeLabel;
  return remaining ? `${typeLabel} ${remaining}` : typeLabel;
}

