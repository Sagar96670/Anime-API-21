const { fetchCatalogFromUrl } = require("../src/sourceAdapter");
const { syncCatalog } = require("../src/sync");

async function main() {
  const url = process.argv[2] || process.env.METADATA_FEED_URL;

  if (!url) {
    console.error("Usage: node scripts/sync-url.js <metadata-feed-url>");
    console.error("Or set METADATA_FEED_URL in the environment.");
    process.exit(1);
  }

  console.log("Fetching metadata feed...");
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
