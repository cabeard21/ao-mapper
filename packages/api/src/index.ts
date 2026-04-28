import "dotenv/config";
import express from "express";
import { pool, migrate } from "./db";
import zonesRouter from "./routes/zones";
import connectionsRouter from "./routes/connections";
import layoutRouter from "./routes/layout";
import { ExpiryService } from "./services/ExpiryService";
import { ConnectionRepository } from "./repositories/ConnectionRepository";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/zones", zonesRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/layout", layoutRouter);

(async () => {
  try {
    await migrate(pool);
  } catch (err) {
    console.error("Failed to run migrations on startup:", err);
    process.exit(1);
  }

  const expiryService = new ExpiryService();
  const connectionRepo = new ConnectionRepository(pool);
  expiryService.start(connectionRepo, (ids) => {
    console.log(`[Expiry] Connections expired: ${ids.join(", ")}`);
  });

  app.listen(PORT, () => {
    console.log(`api listening on http://localhost:${PORT}`);
  });
})();
