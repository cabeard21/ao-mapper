import { pool } from "../db";
import { AfmStaticRouteRepository } from "../repositories/AfmStaticRouteRepository";
import { ConnectionRepository } from "../repositories/ConnectionRepository";
import { StaticRoadRepository } from "../repositories/StaticRoadRepository";
import { ZoneRepository } from "../repositories/ZoneRepository";
import type { RouteEdge } from "./RouteOptimizer";
import { RouteOptimizer } from "./RouteOptimizer";
import { createRouteCache } from "./routeCache";

const connectionRepo = new ConnectionRepository(pool);
const afmStaticRouteRepo = new AfmStaticRouteRepository(pool);
const staticRoadRepo = new StaticRoadRepository(pool);
export const zoneRepo = new ZoneRepository(pool);

async function findStaticEdges(): Promise<RouteEdge[]> {
  const [afmEdges, roadEdges] = await Promise.all([
    afmStaticRouteRepo.findEdges().catch((error: unknown) => {
      console.warn("[route] AFM static route edges unavailable:", error);
      return [] as RouteEdge[];
    }),
    staticRoadRepo.findEdges().catch((error: unknown) => {
      console.warn("[route] Static road edges unavailable:", error);
      return [] as RouteEdge[];
    }),
  ]);
  return [...afmEdges, ...roadEdges];
}

export const routeOptimizer = new RouteOptimizer({
  findActiveConnections: () => connectionRepo.findActive(),
  findStaticEdges,
  findZoneById: (id) => zoneRepo.findById(id),
  cache: createRouteCache(process.env.REDIS_URL),
});
