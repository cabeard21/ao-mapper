import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { ZoneRepository } from "../repositories/ZoneRepository";
import type { ApiResponse, PaginatedResponse, Zone } from "@ao-mapper/shared";

const router: ReturnType<typeof Router> = Router();
const repo = new ZoneRepository(pool);

const listQuerySchema = z.object({
  q: z.string().optional(),
  tier: z.coerce.number().int().min(1).max(8).optional(),
  type: z.enum(["royal", "black", "red", "yellow", "blue", "roads", "unknown"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const searchQuerySchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters"),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.errors.map((e) => e.message).join(", ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

router.get("/", async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: getErrorMessage(parsed.error),
    };
    return res.status(400).json(body);
  }

  const { q, tier, type, limit, offset } = parsed.data;
  try {
    const [zones, total] = await Promise.all([
      repo.findAll({ q, tier, type, limit, offset }),
      repo.count({ q, tier, type }),
    ]);
    const body: PaginatedResponse<Zone> = {
      success: true,
      data: zones,
      error: null,
      meta: {
        total,
        page: Math.floor(offset / limit) + 1,
        limit,
      },
    };
    return res.json(body);
  } catch (error: unknown) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: getErrorMessage(error),
    };
    return res.status(500).json(body);
  }
});

// IMPORTANT: /search must be registered BEFORE /:id so Express matches it first.
router.get("/search", async (req: Request, res: Response) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: getErrorMessage(parsed.error),
    };
    return res.status(400).json(body);
  }

  try {
    const zones = await repo.search(parsed.data.q);
    const body: ApiResponse<Zone[]> = { success: true, data: zones, error: null };
    return res.json(body);
  } catch (error: unknown) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: getErrorMessage(error),
    };
    return res.status(500).json(body);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const zone = await repo.findById(id);
    if (!zone) {
      const body: ApiResponse<null> = {
        success: false,
        data: null,
        error: "Zone not found",
      };
      return res.status(404).json(body);
    }
    const body: ApiResponse<Zone> = { success: true, data: zone, error: null };
    return res.json(body);
  } catch (error: unknown) {
    const body: ApiResponse<null> = {
      success: false,
      data: null,
      error: getErrorMessage(error),
    };
    return res.status(500).json(body);
  }
});

export default router;
