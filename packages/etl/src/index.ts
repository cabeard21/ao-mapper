import "dotenv/config";

async function main() {
  console.log("ETL — no import scripts registered yet");
  console.log("Run: pnpm --filter etl import");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
