import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ApiResponse, CityDistance } from "@ao-mapper/shared";
import type { RouteResult } from "../services/RouteOptimizer";
import { routeOptimizer } from "../services/routeOptimizerInstance";

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
