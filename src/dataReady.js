const { readDatabase } = require("./database");
const { fetchCatalogFromUrl } = require("./sourceAdapter");
const { syncCatalog } = require("./sync");

let inFlight = null;

function hasCatalogData(db) {
  const animeReady = Array.isArray(db.anime) && db.anime.length > 0;
  const episodesReady = Array.isArray(db.episodes) && db.episodes.length > 0;
  const moviesReady = Array.isArray(db.movies) && db.movies.length > 0;

  // The first sync can populate anime before the episode/movie pass finishes.
  // Treat that partial state as not ready so the next request retries the
  // complete catalog build automatically.
  return animeReady && (episodesReady || moviesReady);
}

async function ensureDataReady() {
  const current = readDatabase();

  if (hasCatalogData(current)) {
    return current;
  }

  if (inFlight) {
    return inFlight;
  }

  const url =
    process.env.METADATA_FEED_URL ||
    "https://www.desidubanime.me";

  inFlight = (async () => {
    console.log("[DATA READY] Catalog is empty. Starting initial metadata sync...");

    const catalog = await fetchCatalogFromUrl(url);

    const incomingCount =
      (Array.isArray(catalog.anime) ? catalog.anime.length : 0) +
      (Array.isArray(catalog.episodes) ? catalog.episodes.length : 0) +
      (Array.isArray(catalog.movies) ? catalog.movies.length : 0);

    if (incomingCount === 0) {
      throw new Error(
        "Metadata source returned no catalog data; keeping the existing database unchanged."
      );
    }

    const result = await syncCatalog(catalog);
    const refreshed = readDatabase();

    if (!hasCatalogData(refreshed)) {
      throw new Error(
        "Initial metadata sync completed without producing anime records."
      );
    }

    console.log(
      "[DATA READY] Initial sync complete: anime=" +
      refreshed.anime.length +
      ", episodes=" +
      refreshed.episodes.length +
      ", movies=" +
      refreshed.movies.length
    );

    return refreshed;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

module.exports = { ensureDataReady, hasCatalogData };
