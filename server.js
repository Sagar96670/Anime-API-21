const express = require("express");
const cors = require("cors");
const { readDatabase } = require("./src/database");
const animeRoutes = require("./src/routes/anime");
const movieRoutes = require("./src/routes/movies");
const adminRoutes = require("./src/routes/admin");
const { startAutomaticSync, stopAutomaticSync } = require("./src/adminSync");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TARGET_SITE_URL = "https://www.desidubanime.me";

if (!process.env.METADATA_FEED_URL) {
  process.env.METADATA_FEED_URL = TARGET_SITE_URL;
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    name: "Anime API 21",
    version: "1.0.0",
    status: "ok",
    metadataSource: TARGET_SITE_URL,
    endpoints: {
      health: "/api/health",
      catalog: "/api/catalog",
      anime: "/api/anime/:id",
      seasons: "/api/anime/:id/seasons",
      episodes: "/api/anime/:id/episodes?season=1",
      episode: "/api/anime/:id/episode/:season/:episode",
      movies: "/api/movies",
      movie: "/api/movie/:id"
    }
  });
});

app.get("/api/health", async (req, res, next) => {
  try {
    const db = await readDatabase();
    res.json({
      status: "ok",
      database: "json",
      metadataSource: TARGET_SITE_URL,
      automaticSync: Boolean(process.env.METADATA_FEED_URL),
      anime: db.anime.length,
      episodes: db.episodes.length,
      movies: db.movies.length,
      updatedAt: db.updatedAt
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api", animeRoutes);
app.use("/api", movieRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("Anime API running on port " + PORT);
  console.log("Metadata source: " + TARGET_SITE_URL);
  startAutomaticSync();
});

function shutdown(signal) {
  console.log(signal + " received. Shutting down...");
  stopAutomaticSync();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
