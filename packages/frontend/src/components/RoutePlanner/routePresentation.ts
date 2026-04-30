import type { RouteResult, RouteStep } from "@ao-mapper/shared";

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
