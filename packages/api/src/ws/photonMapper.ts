const ZONE_UNIQUE_NAME_PATTERN = /^(?:OPEN_WORLD|ROADS|MISTS|DUNGEON|TUNNEL|HELLGATE|CORRUPTED|TEST)_/i;
const ZONE_FIELD_PATTERN = /(zone|cluster|location|map).*?(unique)?name/i;

export function parseSnifferMessage(message: string): unknown | null {
  try {
    return JSON.parse(message) as unknown;
  } catch {
    return null;
  }
}

export function extractCurrentZoneUniqueName(message: unknown): string | null {
  const photonEvent = unwrapPhotonEvent(message);
  if (!photonEvent) {
    return null;
  }

  return findZoneUniqueName(photonEvent.parameters) ?? findZoneUniqueName(photonEvent);
}

interface PhotonEventLike {
  eventCode?: unknown;
  code?: unknown;
  parameters?: unknown;
}

function unwrapPhotonEvent(message: unknown): PhotonEventLike | null {
  if (!isRecord(message)) {
    return null;
  }

  if (message.type === "photonEvent") {
    return isRecord(message.data) ? normalizePhotonEvent(message.data) : normalizePhotonEvent(message);
  }

  if (message.type === "packet" && isRecord(message.data)) {
    return unwrapPhotonEvent(message.data);
  }

  if (message.type === "event" && isRecord(message.data)) {
    return normalizePhotonEvent(message.data);
  }

  return normalizePhotonEvent(message);
}

function normalizePhotonEvent(value: Record<string, unknown>): PhotonEventLike | null {
  const eventCode = value.eventCode ?? value.code ?? value.Code;
  const parameters = value.parameters ?? value.Parameters ?? value.NamedParameters;

  if (eventCode === undefined && parameters === undefined) {
    return null;
  }

  return { eventCode, code: value.code, parameters };
}

function findZoneUniqueName(value: unknown, parentKey = ""): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isZoneUniqueName(trimmed) || (ZONE_FIELD_PATTERN.test(parentKey) && trimmed.length > 0)) {
      return trimmed;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findZoneUniqueName(item, parentKey);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const [key, nested] of Object.entries(value)) {
    const found = findZoneUniqueName(nested, key);
    if (found) {
      return found;
    }
  }

  return null;
}

function isZoneUniqueName(value: string): boolean {
  return ZONE_UNIQUE_NAME_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
