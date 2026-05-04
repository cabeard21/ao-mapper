import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import { pool } from "../db";
import { UserSettingsRepository } from "../repositories/UserSettingsRepository";

const router: ReturnType<typeof Router> = Router();
const repo = new UserSettingsRepository(pool);

const zoneIdSchema = z.object({ zoneId: z.string().uuid() });

router.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await repo.get();
    res.json({ success: true, data });
  } catch (err) {
    console.error("[settings] get failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.put("/home-zone", async (req: Request, res: Response) => {
  try {
    const { zoneId } = zoneIdSchema.parse(req.body);
    await repo.setHomeZone(zoneId);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ success: false, error: err.errors[0]?.message ?? "Invalid input" });
      return;
    }
    if (err instanceof Error && err.message.startsWith("Zone not found")) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    console.error("[settings] setHomeZone failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/home-zone", async (_req: Request, res: Response) => {
  try {
    await repo.clearHomeZone();
    res.json({ success: true });
  } catch (err) {
    console.error("[settings] clearHomeZone failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
