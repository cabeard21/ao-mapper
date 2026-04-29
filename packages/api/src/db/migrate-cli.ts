import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve("../../.env") });
import pool from "./pool";
import { migrate } from "./migrate";

(async () => {
  try {
    console.log("Running migrations...");
    await migrate(pool);
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
