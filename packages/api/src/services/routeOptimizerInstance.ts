import { pool } from "../db";
import { ConnectionRepository } from "../repositories/ConnectionRepository";
import { StaticRoadRepository } from "../repositories/StaticRoadRepository";
import { ZoneRepository } from "../repositories/ZoneRepository";
import { RouteOptimizer } from "./RouteOptimizer";
import { createRouteCache } from "./routeCache";

const connectionRepo = new ConnectionRepository(pool);
const staticRoadRepo = new StaticRoadRepository(pool);
const zoneRepo = new ZoneRepository(pool);

export const routeOptimizer = new RouteOptimizer({
  findActiveConnections: () => connectionRepo.findActive(),
  findStaticEdges: () => staticRoadRepo.findEdges(),
  findZoneById: (id) => zoneRepo.findById(id),
  cache: createRouteCache(process.env.REDIS_URL),
});
