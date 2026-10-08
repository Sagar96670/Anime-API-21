const { fetchCatalogFromUrl } = require("./sourceAdapter");
const { syncCatalog } = require("./sync");

let state = {
  running: false,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastResult: null,
  lastError: null
};

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

module.exports = { getSyncState, runRemoteSync };
