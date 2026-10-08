const fs = require("fs/promises");
const path = require("path");
const { syncCatalog } = require("../src/sync");

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node scripts/sync-catalog.js <catalog.json>");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), input);
  const raw = await fs.readFile(filePath, "utf8");
  const payload = JSON.parse(raw);
  const result = await syncCatalog(payload);

  console.log("Sync complete:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Sync failed:", error.message);
  process.exit(1);
});
