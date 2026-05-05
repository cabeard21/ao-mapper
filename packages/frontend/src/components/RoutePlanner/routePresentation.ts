import type { RouteResult, RouteStep, Zone } from "@ao-mapper/shared";

type PlannerShortcutNode = {
  id: string;
  zone: Zone;
};

export function formatRouteCost(route: Pick<RouteResult, "hops" | "cost">): string {
  const hops = route.hops ?? 0;
  const cost = route.cost ?? 0;
  return `${hops} ${hops === 1 ? "hop" : "hops"} - cost ${Number.isInteger(cost) ? cost : cost.toFixed(1)}`;
}

export function formatRouteDirection(
  label: "Enter" | "Exit",
  direction: RouteStep["enterDirection"]
): string | null {
  return direction ? `${label} ${direction}` : null;
}

export function routeHasDirections(step: RouteStep): boolean {
  return step.zone.zoneType !== "roads" && Boolean(step.enterDirection || step.exitDirection);
}

export function findPlannerShortcutZone(
  nodes: PlannerShortcutNode[],
  zoneId: string | null
): Zone | null {
  if (!zoneId) {
    return null;
  }
  return nodes.find((node) => node.id === zoneId)?.zone ?? null;
}

export function swapPlannerZones(
  fromZone: Zone | null,
  toZone: Zone | null
): { fromZone: Zone | null; toZone: Zone | null } {
  return { fromZone: toZone, toZone: fromZone };
}

export function centeredRouteScrollTop(
  container: Pick<HTMLElement, "clientHeight" | "scrollHeight">,
  target: Pick<HTMLElement, "offsetTop" | "offsetHeight">,
  verticalBiasPx = 32
): number {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const centeredTop =
    target.offsetTop - (container.clientHeight - target.offsetHeight) / 2 - verticalBiasPx;
  return Math.min(Math.max(0, centeredTop), maxScrollTop);
}
