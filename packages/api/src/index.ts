import "dotenv/config";
import express from "express";
import { pool, migrate } from "./db";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

(async () => {
  try {
    await migrate(pool);
  } catch (err) {
    console.error("Failed to run migrations on startup:", err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`api listening on http://localhost:${PORT}`);
  });
})();
