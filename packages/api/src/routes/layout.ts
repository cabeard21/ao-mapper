import { Router, Request, Response } from "express";
import { z, ZodError } from "zod";
import { pool } from "../db";
import { LayoutRepository } from "../repositories/LayoutRepository";

const router: ReturnType<typeof Router> = Router();
const repo = new LayoutRepository(pool);

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const zoneIdSchema = z.string().uuid();

const formatZodError = (err: ZodError): string =>
  err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");

router.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await repo.findAll();
    res.json({ success: true, data });
  } catch (err) {
    console.error("[layout] findAll failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/nodes", async (_req: Request, res: Response) => {
  try {
    const data = await repo.findAllNodes();
    res.json({ success: true, data });
  } catch (err) {
    console.error("[layout] findAllNodes failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.put("/:zoneId", async (req: Request, res: Response) => {
  try {
    const zoneId = zoneIdSchema.parse(req.params.zoneId);
    const { x, y } = positionSchema.parse(req.body);
    await repo.upsert(zoneId, x, y);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ success: false, error: formatZodError(err) });
      return;
    }
    console.error("[layout] upsert failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.delete("/:zoneId", async (req: Request, res: Response) => {
  try {
    const zoneId = zoneIdSchema.parse(req.params.zoneId);
    await repo.delete(zoneId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ success: false, error: formatZodError(err) });
      return;
    }
    console.error("[layout] delete failed:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;
