import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockQuery = vi.fn();
const mockBroadcast = vi.fn();

vi.mock("../db", () => ({ pool: { query: mockQuery } }));
vi.mock("../ws/realtime", () => ({ broadcastRealtimeEvent: mockBroadcast }));
vi.mock("../services/invalidateRoutes", () => ({ invalidateRoutesBestEffort: vi.fn() }));
vi.mock("../repositories/ConnectionRepository", () => ({
  ConnectionRepository: vi.fn().mockImplementation(() => ({
    findActive: vi.fn().mockResolvedValue([]),
    findExpired: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  })),
}));

const buildApp = async () => {
  const { default: connectionsRouter } = await import("./connections");
  const app = express();
  app.use(express.json());
  app.use("/api/connections", connectionsRouter);
  return app;
};

describe("POST /api/connections/ocr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and broadcasts ocr:result when zone is found", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "zone-uuid", unique_name: "SERITOS_ONAYTUM", display_name: "Seritos-Onaytum" }],
    });
    const app = await buildApp();

    const res = await request(app).post("/api/connections/ocr").send({
      toZoneName: "Seritos-Onaytum",
      charges: 7,
      closesInMinutes: 705,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.toZone.id).toBe("zone-uuid");
    expect(res.body.data.connType).toBe("PORTAL_7");
    expect(res.body.data.closesInMinutes).toBe(705);
    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ocr:result", connType: "PORTAL_7" })
    );
  });

  it("maps charges >= 20 to PORTAL_20", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "zone-uuid", unique_name: "SOME_ZONE", display_name: "Some Zone" }],
    });
    const app = await buildApp();

    const res = await request(app).post("/api/connections/ocr").send({
      toZoneName: "Some Zone",
      charges: 20,
      closesInMinutes: 60,
    });

    expect(res.body.data.connType).toBe("PORTAL_20");
  });

  it("returns 404 when zone is not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const app = await buildApp();

    const res = await request(app).post("/api/connections/ocr").send({
      toZoneName: "Unknown Zone",
      charges: 7,
      closesInMinutes: 60,
    });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Zone not found/);
  });

  it("returns 400 for missing required fields", async () => {
    const app = await buildApp();

    const res = await request(app).post("/api/connections/ocr").send({
      toZoneName: "Some Zone",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("returns 400 for invalid closesInMinutes (zero)", async () => {
    const app = await buildApp();

    const res = await request(app).post("/api/connections/ocr").send({
      toZoneName: "Some Zone",
      charges: 7,
      closesInMinutes: 0,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
