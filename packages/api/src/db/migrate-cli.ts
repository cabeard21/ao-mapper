import "dotenv/config";
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
