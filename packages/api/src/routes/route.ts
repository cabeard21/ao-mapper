import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ApiResponse, CityDistance, RouteResult } from "@ao-mapper/shared";
import { routeOptimizer, zoneRepo } from "../services/routeOptimizerInstance";

const KNOWN_CITY_NAMES = [
  "Bridgewatch",
  "Caerleon",
  "Fort Sterling",
  "Lymhurst",
  "Martlock",
  "Thetford",
  "Brecilien",
];

const router: ReturnType<typeof Router> = Router();

const routeQuerySchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
});

const cityQuerySchema = z.object({
  from: z.string().uuid(),
});

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

router.get("/", async (req: Request, res: Response) => {
  const parsed = routeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: errorMessage(parsed.error),
    };
    return res.status(400).json(body);
  }

  try {
    const result = await routeOptimizer.findRoute(parsed.data.from, parsed.data.to);
    const body: ApiResponse<RouteResult> = {
      success: true,
      data: result,
      error: null,
    };
    return res.json(body);
  } catch (error) {
    console.error("[route] findRoute failed:", error);
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: "Internal server error",
    };
    return res.status(500).json(body);
  }
});

router.get("/nearest-city", async (req: Request, res: Response) => {
  const parsed = cityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: errorMessage(parsed.error),
    };
    return res.status(400).json(body);
  }

  try {
    const results: RouteResult[] = [];
    for (const name of KNOWN_CITY_NAMES) {
      const candidates = await zoneRepo.search(name, 5);
      for (const cityZone of candidates) {
        const result = await routeOptimizer.findRoute(parsed.data.from, cityZone.id);
        if (result.path !== null) {
          results.push(result);
          break;
        }
      }
    }

    const best =
      results.length === 0
        ? { path: null, steps: [], hops: 0, cost: 0 }
        : results.reduce((a, b) =>
            (a.cost ?? Number.POSITIVE_INFINITY) <= (b.cost ?? Number.POSITIVE_INFINITY) ? a : b
          );

    const body: ApiResponse<RouteResult> = { success: true, data: best, error: null };
    return res.json(body);
  } catch (error) {
    console.error("[route] nearest-city failed:", error);
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: "Internal server error",
    };
    return res.status(500).json(body);
  }
});

router.get("/nearest-red", async (req: Request, res: Response) => {
  const parsed = cityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: errorMessage(parsed.error),
    };
    return res.status(400).json(body);
  }

  try {
    const redZones = await zoneRepo.findAll({ type: "red", limit: 100 });

    const results: RouteResult[] = [];
    for (const zone of redZones) {
      const result = await routeOptimizer.findRoute(parsed.data.from, zone.id);
      if (result.path !== null) {
        results.push(result);
      }
    }

    const best =
      results.length === 0
        ? { path: null, steps: [], hops: 0, cost: 0 }
        : results.reduce((a, b) =>
            (a.cost ?? Number.POSITIVE_INFINITY) <= (b.cost ?? Number.POSITIVE_INFINITY) ? a : b
          );

    const body: ApiResponse<RouteResult> = { success: true, data: best, error: null };
    return res.json(body);
  } catch (error) {
    console.error("[route] nearest-red failed:", error);
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: "Internal server error",
    };
    return res.status(500).json(body);
  }
});

router.get("/to-city", async (req: Request, res: Response) => {
  const parsed = cityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: errorMessage(parsed.error),
    };
    return res.status(400).json(body);
  }

  try {
    const result = await routeOptimizer.findCityDistances(parsed.data.from);
    const body: ApiResponse<CityDistance[]> = {
      success: true,
      data: result,
      error: null,
    };
    return res.json(body);
  } catch (error) {
    console.error("[route] findCityDistances failed:", error);
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: "Internal server error",
    };
    return res.status(500).json(body);
  }
});

export default router;
