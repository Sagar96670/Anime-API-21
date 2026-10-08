const express = require("express");
const cors = require("cors");
const { readDatabase } = require("./src/database");
const animeRoutes = require("./src/routes/anime");
const movieRoutes = require("./src/routes/movies");
const adminRoutes = require("./src/routes/admin");
const { getSyncState, startAutomaticSync, stopAutomaticSync } = require("./src/adminSync");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TARGET_SITE_URL = process.env.METADATA_FEED_URL || "https://www.desidubanime.me";

if (!process.env.METADATA_FEED_URL) {
  process.env.METADATA_FEED_URL = TARGET_SITE_URL;
}

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.json({
    name: "Anime API 21",
    version: "1.1.0",
    status: "ok",
    database: "json",
    metadataSource: TARGET_SITE_URL,
    automaticSync: true,
    endpoints: {
      health: "/api/health",
      catalog: "/api/catalog?page=1&limit=20&search=naruto",
      anime: "/api/anime/:id",
      seasons: "/api/anime/:id/seasons",
      episodes: "/api/anime/:id/episodes?season=1",
      episode: "/api/anime/:id/episode/:season/:episode",
      movies: "/api/movies?page=1&limit=20&search=...",
      movie: "/api/movie/:id"
    }
  });
});

app.get("/api/health", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const sync = getSyncState();

    res.json({
      status: "ok",
      database: "json",
      metadataSource: TARGET_SITE_URL,
      automaticSync: Boolean(process.env.METADATA_FEED_URL),
      sync,
      counts: {
        anime: db.anime.length,
        episodes: db.episodes.length,
        movies: db.movies.length
      },
      updatedAt: db.updatedAt
    });
  } catch (error) {
    next(error);
  }
});


app.get("/api/hls-proxy", async (req, res) => {
  try {
    const target = String(req.query.url || "");
    if (!target) return res.status(400).send("Missing url");

    const targetUrl = new URL(target);
    const allowedHosts = String(process.env.AUTHORIZED_VIDEO_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);

    if (!allowedHosts.includes(targetUrl.hostname.toLowerCase())) {
      return res.status(403).send("Host not allowed");
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Anime-API-21/1.1 (+authorized HLS proxy)"
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      return res.status(response.status).send(await response.text());
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const isPlaylist =
      targetUrl.pathname.toLowerCase().endsWith(".m3u8") ||
      contentType.includes("mpegurl");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");

    if (isPlaylist) {
      const playlist = await response.text();
      const proxyUrl = (url) => "/api/hls-proxy?url=" + encodeURIComponent(url);

      const rewritten = playlist.split(/\r?\n/).map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        if (trimmed.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (match, uri) => {
            try {
              return 'URI="' + proxyUrl(new URL(uri, targetUrl).toString()) + '"';
            } catch {
              return match;
            }
          });
        }

        try {
          return proxyUrl(new URL(trimmed, targetUrl).toString());
        } catch {
          return line;
        }
      }).join("\n");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(rewritten);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    return res.send(buffer);
  } catch (error) {
    console.error("Authorized HLS proxy error:", error.message);
    return res.status(502).send("HLS proxy error");
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
