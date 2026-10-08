const { fetchCatalogFromUrl } = require("../src/sourceAdapter");
const { syncCatalog } = require("../src/sync");

const DEFAULT_METADATA_FEED_URL = "https://www.desidubanime.me";

async function main() {
  const url =
    process.argv[2] ||
    process.env.METADATA_FEED_URL ||
    DEFAULT_METADATA_FEED_URL;

  console.log("Fetching metadata feed from " + url + "...");

  const catalog = await fetchCatalogFromUrl(url);

  console.log(
    "Received " +
      catalog.anime.length + " anime, " +
      catalog.episodes.length + " episodes, " +
      catalog.movies.length + " movies."
  );

  const result = await syncCatalog(catalog);

  console.log("Sync complete:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Sync failed:", error.message);
  process.exit(1);
});
