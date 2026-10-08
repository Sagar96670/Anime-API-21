const { fetchCatalogFromUrl } = require("./sourceAdapter");
const { syncCatalog } = require("./sync");

let state = {
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastResult: null,
  lastError: null
};

let timer = null;

function getSyncState() {
  return { ...state };
}

async function runRemoteSync() {
  if (state.running) {
    return { started: false, reason: "sync_already_running", state: getSyncState() };
  }

  const url = process.env.METADATA_FEED_URL;
  if (!url) throw new Error("METADATA_FEED_URL is not configured");

  state.running = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastError = null;

  try {
    const catalog = await fetchCatalogFromUrl(url);
    const result = await syncCatalog(catalog);
    state.lastResult = result;
    return { started: true, result };
  } catch (error) {
    state.lastError = error.message;
    throw error;
  } finally {
    state.running = false;
    state.lastFinishedAt = new Date().toISOString();
  }
}

function startAutomaticSync() {
  // Vercel uses Cron Jobs instead of a long-lived setInterval timer.
  if (process.env.VERCEL || timer || !process.env.METADATA_FEED_URL) {
    return false;
  }

  const intervalMinutes = Math.max(Number(process.env.SYNC_INTERVAL_MINUTES) || 60, 5);
  const intervalMs = intervalMinutes * 60 * 1000;

  runRemoteSync().catch((error) => {
    console.error(new Date().toISOString(), "Initial metadata sync failed:", error.message);
  });

  timer = setInterval(() => {
    runRemoteSync().catch((error) => {
      console.error(new Date().toISOString(), "Scheduled metadata sync failed:", error.message);
    });
  }, intervalMs);

  console.log("Automatic metadata sync enabled every " + intervalMinutes + " minutes.");
  return true;
}

function stopAutomaticSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { getSyncState, runRemoteSync, startAutomaticSync, stopAutomaticSync };
