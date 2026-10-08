const { fetchCatalogFromUrl } = require("../src/sourceAdapter");
const { syncCatalog } = require("../src/sync");

const url = process.env.METADATA_FEED_URL;
const intervalMinutes = Math.max(Number(process.env.SYNC_INTERVAL_MINUTES) || 60, 5);
const intervalMs = intervalMinutes * 60 * 1000;

if (!url) {
  console.error("METADATA_FEED_URL is required.");
  process.exit(1);
}

let running = false;

async function runSync() {
  if (running) {
    console.log("Previous sync is still running; skipping this cycle.");
    return;
  }

  running = true;
  try {
    console.log(new Date().toISOString(), "Starting metadata sync...");
    const catalog = await fetchCatalogFromUrl(url);
    const result = await syncCatalog(catalog);
    console.log(new Date().toISOString(), "Sync complete:", JSON.stringify(result));
  } catch (error) {
    console.error(new Date().toISOString(), "Sync failed:", error.message);
  } finally {
    running = false;
  }
}

runSync();
setInterval(runSync, intervalMs);

console.log("Automatic metadata sync enabled every " + intervalMinutes + " minutes.");
