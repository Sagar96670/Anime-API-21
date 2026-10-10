const express = require("express");
const { readDatabase } = require("../database");
const { ensureDataReady } = require("../dataReady");

const router = express.Router();

async function fetchMovieIframeSrc(sourceUrl) {
  if (!sourceUrl || !/^https?:\\/\\//i.test(sourceUrl)) return null;
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "Anime-API-21/1.1 (+public movie metadata)",
      "Accept": "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) return null;
  const html = await response.text();

  // Only use a public iframe explicitly embedded in the movie page.
  const match = html.match(/<iframe\\b[^>]*\\bsrc=["']([^"']+)["'][^>]*>/i);
  if (!match) return null;
  try {
    return new URL(match[1], sourceUrl).toString();
  } catch {
    return null;
  }
}

router.get("/movies", async (req, res, next) => {
  try {
    const db = await ensureDataReady();
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const search = String(req.query.search || "").trim().toLowerCase();
    const filtered = db.movies.filter((movie) => {
      if (!search) return true;
      return [movie.title, movie.slug, ...(movie.altTitles || [])].filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
    const start = (page - 1) * limit;
    res.json({ page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit), data: filtered.slice(start, start + limit) });
  } catch (error) { next(error); }
});

router.get("/movie/:id", async (req, res, next) => {
  try {
    const db = await ensureDataReady();
    const movie = db.movies.find((item) => item.id === req.params.id || item.slug === req.params.id);
    if (!movie) return res.status(404).json({ error: "Movie not found" });
    res.json(movie);
  } catch (error) { next(error); }
});


router.get("/movies/:id", async (req, res, next) => {
  try {
    const db = await ensureDataReady();
    const movie = db.movies.find((item) => item.id === req.params.id || item.slug === req.params.id);
    if (!movie) return res.status(404).json({ status: false, message: "Movie not found" });
    res.json({ status: true, data: movie });
  } catch (error) { next(error); }
});

router.get("/movies/:id/stream", async (req, res, next) => {
  try {
    const db = await ensureDataReady();
    const movie = db.movies.find((item) => item.id === req.params.id || item.slug === req.params.id);
    if (!movie) return res.status(404).json({ status: false, message: "Movie not found" });

    const directSource = [
      movie.video_url, movie.videoUrl, movie.stream_url, movie.streamUrl,
      movie.iframe_url, movie.iframeUrl
    ].find((value) => typeof value === "string" && /^https?:\\/\\//i.test(value));

    const sourceUrl = movie.sourceUrl || movie.source_url || movie.url;
    const iframeUrl = directSource || await fetchMovieIframeSrc(sourceUrl);
    if (!iframeUrl) {
      return res.status(404).json({
        status: false,
        message: "No public movie iframe or direct video source was found",
        source_url: sourceUrl || null
      });
    }

    const isDirectMedia = /\\.(m3u8|mp4|webm|ogg)(?:$|[?#])/i.test(iframeUrl);
    return res.json({
      status: true,
      movie_id: movie.id,
      title: movie.title,
      stream_url: iframeUrl,
      video_url: iframeUrl,
      iframe_url: isDirectMedia ? null : iframeUrl,
      playback_mode: isDirectMedia ? "direct" : "iframe",
      hls: /\\.m3u8(?:$|[?#])/i.test(iframeUrl),
      poster: movie.poster || movie.thumbnail || null
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
