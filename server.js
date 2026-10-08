const express = require("express");
const cors = require("cors");
const { readDatabase } = require("./src/database");
const animeRoutes = require("./src/routes/anime");
const movieRoutes = require("./src/routes/movies");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    name: "Anime API 21",
    version: "1.0.0",
    status: "ok",
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
    res.json({ status: "ok", database: "json", anime: db.anime.length, episodes: db.episodes.length, movies: db.movies.length, updatedAt: db.updatedAt });
  } catch (error) { next(error); }
});

app.use("/api", animeRoutes);
app.use("/api", movieRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => console.log("Anime API running on http://localhost:" + PORT));
