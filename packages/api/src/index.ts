import "dotenv/config";
import { createServer } from "http";
import express from "express";
import { pool, migrate } from "./db";
import zonesRouter from "./routes/zones";
import connectionsRouter from "./routes/connections";
import layoutRouter from "./routes/layout";
import routeRouter from "./routes/route";
import { ExpiryService } from "./services/ExpiryService";
import { ConnectionRepository } from "./repositories/ConnectionRepository";
import { invalidateRoutesBestEffort } from "./services/invalidateRoutes";
import { broadcastRealtimeEvent, startRealtimeServer } from "./ws/realtime";
import { startSnifferClient } from "./ws/snifferClient";

const app = express();
const PORT = process.env.PORT ?? 3001;
const httpServer = createServer(app);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/zones", zonesRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/layout", layoutRouter);
app.use("/api/route", routeRouter);

(async () => {
  try {
    await migrate(pool);
  } catch (err) {
    console.error("Failed to run migrations on startup:", err);
    process.exit(1);
  }

  const expiryService = new ExpiryService();
  const connectionRepo = new ConnectionRepository(pool);
  startRealtimeServer(httpServer);
  startSnifferClient(pool);

  expiryService.start(connectionRepo, async (ids) => {
    console.log(`[Expiry] Connections expired: ${ids.join(", ")}`);
    await invalidateRoutesBestEffort("connection expiry");
    broadcastRealtimeEvent({ type: "connection:expired", connectionIds: ids });
    broadcastRealtimeEvent({ type: "route:updated" });
  });

  httpServer.listen(PORT, () => {
    console.log(`api listening on http://localhost:${PORT}`);
  });
})();
