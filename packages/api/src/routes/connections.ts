import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import { pool } from "../db";
import { ConnectionRepository } from "../repositories/ConnectionRepository";
import { invalidateRoutesBestEffort } from "../services/invalidateRoutes";
import { broadcastRealtimeEvent } from "../ws/realtime";

const router: ReturnType<typeof Router> = Router();
const repo = new ConnectionRepository(pool);

const connTypeEnum = z.enum([
  "BZ_PORTAL",
  "ROYAL_ROAD",
  "AVALON_ROAD",
  "TUNNEL",
  "HIGHWAY",
]);

const createSchema = z.object({
  fromZoneId: z.string().uuid(),
  toZoneId: z.string().uuid(),
  connType: connTypeEnum,
  durationHours: z.number().positive().nullable().optional(),
});

const updateSchema = z.object({
  connType: connTypeEnum.optional(),
  durationHours: z.number().positive().nullable().optional(),
});

const formatZodError = (err: ZodError): string =>
  err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");

router.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await repo.findActive();
    res.json({ success: true, data });
  } catch (err) {
    console.error("[connections] findActive failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/expired", async (_req: Request, res: Response) => {
  try {
    const data = await repo.findExpired();
    res.json({ success: true, data });
  } catch (err) {
    console.error("[connections] findExpired failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = createSchema.parse(req.body);
    const created = await repo.create(parsed);
    await invalidateRoutesBestEffort("connection create");
    broadcastRealtimeEvent({ type: "connection:created", connection: created });
    broadcastRealtimeEvent({ type: "route:updated" });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ success: false, error: formatZodError(err) });
      return;
    }
    console.error("[connections] create failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const parsed = updateSchema.parse(req.body);
    const updated = await repo.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ success: false, error: "Connection not found" });
      return;
    }
    await invalidateRoutesBestEffort("connection update");
    broadcastRealtimeEvent({ type: "connection:updated", connection: updated });
    broadcastRealtimeEvent({ type: "route:updated" });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ success: false, error: formatZodError(err) });
      return;
    }
    console.error("[connections] update failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const deleted = await repo.delete(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: "Connection not found" });
      return;
    }
    await invalidateRoutesBestEffort("connection delete");
    broadcastRealtimeEvent({ type: "connection:deleted", connectionId: req.params.id });
    broadcastRealtimeEvent({ type: "route:updated" });
    res.status(204).send();
  } catch (err) {
    console.error("[connections] delete failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
