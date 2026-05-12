import type { Resource, Zone, ZoneType } from "@ao-mapper/shared";
import type { CytoNode, NodeSource } from "../store/mapStore";

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

export function zoneToNode(zone: Zone, source: NodeSource = "manual") {
  return {
    id: zone.id,
    label: zone.displayName,
    source,
    zoneType: zone.zoneType,
    tier: zone.tier,
    zone,
  };
}

export function getSoloChestCount(zone: Zone): number {
  const chests = zone.metadata.chests as Array<{ type: string; count: number }> | undefined;
  if (!chests) return 0;
  return chests.filter((c) => c.type === "GREEN").reduce((sum, c) => sum + c.count, 0);
}

export function getNearestCityHops(zone: Zone): number | null {
  if (!zone.cityDistances.length) return null;
  return Math.min(...zone.cityDistances.map((d) => d.hops));
}

export function getZoneQuality(zone: Zone): number | null {
  const match = zone.uniqueName.match(/_Q(\d)/);
  return match ? parseInt(match[1], 10) : null;
}

export function buildNodeLabel(node: CytoNode): string {
  const tier = node.tier > 0 ? `T${node.tier}` : "";

  if (node.zoneType === "roads") {
    const soloCount = getSoloChestCount(node.zone);
    const parts = [tier, soloCount > 0 ? `${soloCount} chests` : null].filter(Boolean);
    return `${node.label}\n${parts.join(" · ")}`;
  }

  const hops = getNearestCityHops(node.zone);
  const hopsPart = hops !== null ? `${hops}h` : null;

  if (node.zoneType === "black") {
    const quality = getZoneQuality(node.zone);
    const qualityPart = quality !== null ? `Q${quality}` : null;
    const parts = [tier, hopsPart, qualityPart].filter(Boolean);
    return `${node.label}\n${parts.join(" · ")}`;
  }

  const parts = [tier, hopsPart].filter(Boolean);
  return `${node.label}\n${parts.join(" · ")}`;
}
