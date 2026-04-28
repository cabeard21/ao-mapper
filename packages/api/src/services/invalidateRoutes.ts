import { routeOptimizer } from "./routeOptimizerInstance";

export async function invalidateRoutesBestEffort(context: string): Promise<void> {
  try {
    await routeOptimizer.invalidateRoutes();
  } catch (error) {
    console.warn(`[route] Failed to invalidate route cache after ${context}:`, error);
  }
}
