import type { Resource, Zone, ZoneType } from "@ao-mapper/shared";

const zoneTypeLabels: Record<ZoneType, string> = {
  royal: "Royal",
  black: "Black Zone",
  red: "Red Zone",
  yellow: "Yellow Zone",
  blue: "Blue Zone",
  roads: "Roads",
  unknown: "Unknown",
};

const resourceIconByType: Record<string, string> = {
  fiber: "/icons/resource_fiber.png",
  hide: "/icons/resource_hide.png",
  ore: "/icons/resource_ore.png",
  rock: "/icons/resource_stone.png",
  stone: "/icons/resource_stone.png",
  wood: "/icons/resource_unknown.png",
};

export function formatZoneType(zoneType: ZoneType): string {
  return zoneTypeLabels[zoneType] ?? zoneTypeLabels.unknown;
}

export function getResourceIcon(resource: Pick<Resource, "type">): string {
  return resourceIconByType[resource.type.toLowerCase()] ?? "/icons/resource_unknown.png";
}

export function getPrimaryZoneIcon(zone: Zone): string | undefined {
  const firstResource = zone.resources[0];
  return firstResource ? getResourceIcon(firstResource) : undefined;
}

export function zoneToNode(zone: Zone) {
  return {
    id: zone.id,
    label: zone.displayName,
    zoneType: zone.zoneType,
    tier: zone.tier,
    zone,
  };
}
