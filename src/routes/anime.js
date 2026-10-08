const express = require("express");
const { readDatabase } = require("../database");

const router = express.Router();
async function fetchEpisodeIframeSrc(sourceUrl) {
  if (!sourceUrl || !/^https?:\\/\\//i.test(sourceUrl)) return null;

  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "Anime-API-21/1.1 (+public episode metadata)",
      "Accept": "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) return null;
  const html = await response.text();
  const match = html.match(/<iframe\\b[^>]*\\bsrc=["']([^"']+)["'][^>]*>/i);
  if (!match) return null;

  try {
    return new URL(match[1], sourceUrl).toString();
  } catch {
    return null;
  }
}


router.get("/catalog", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const search = String(req.query.search || "").trim().toLowerCase();
    const filtered = db.anime.filter((anime) => {
      if (!search) return true;
      return [anime.title, anime.slug, ...(anime.altTitles || [])].filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
    const start = (page - 1) * limit;
    res.json({ page, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit), data: filtered.slice(start, start + limit) });
  } catch (error) { next(error); }
});

router.get("/anime/:id", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const anime = db.anime.find((item) => item.id === req.params.id || item.slug === req.params.id);
    if (!anime) return res.status(404).json({ error: "Anime not found" });
    const episodes = db.episodes.filter((episode) => episode.animeId === anime.id);
    const seasons = [...new Set(episodes.map((episode) => episode.season))].sort((a, b) => a - b);
    res.json({ ...anime, seasons, episodeCount: episodes.length });
  } catch (error) { next(error); }
});

router.get("/anime/:id/seasons", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const anime = db.anime.find((item) => item.id === req.params.id || item.slug === req.params.id);
    if (!anime) return res.status(404).json({ error: "Anime not found" });
    const seasons = new Map(
      (Array.isArray(anime.seasons) ? anime.seasons : [])
        .map((season) => [Number(season), { season: Number(season), episodeCount: 0 }])
        .filter(([season]) => Number.isInteger(season) && season > 0)
    );

    for (const episode of db.episodes.filter((item) => item.animeId === anime.id)) {
      const season = Number(episode.season ?? 1);
      if (!Number.isInteger(season) || season < 1) continue;
      if (!seasons.has(season)) {
        seasons.set(season, { season, episodeCount: 0 });
      }
      seasons.get(season).episodeCount++;
    }

    res.json([...seasons.values()].sort((a, b) => a.season - b.season));
  } catch (error) { next(error); }
});

router.get("/anime/:id/episodes", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const anime = db.anime.find((item) => item.id === req.params.id || item.slug === req.params.id);
    if (!anime) return res.status(404).json({ error: "Anime not found" });
    const season = req.query.season == null ? null : Number(req.query.season);
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), 100);
    let episodes = db.episodes.filter((e) => e.animeId === anime.id)
      .filter((e) => season == null || e.season === season)
      .sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    const total = episodes.length;
    episodes = episodes.slice((page - 1) * limit, page * limit);
    res.json({ animeId: anime.id, season, page, limit, total, totalPages: Math.ceil(total / limit), data: episodes });
  } catch (error) { next(error); }
});


router.get("/anime/:id/episode/:season/:episode/stream", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const anime = db.anime.find((item) => item.id === req.params.id || item.slug === req.params.id);

    if (!anime) {
      return res.status(404).json({ status: false, message: "Anime not found" });
    }

    const season = Number(req.params.season);
    const episodeNumber = Number(req.params.episode);

    if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episodeNumber) || episodeNumber < 1) {
      return res.status(400).json({ status: false, message: "Invalid season or episode number" });
    }

    const episode = db.episodes.find((item) =>
      item.animeId === anime.id &&
      Number(item.season) === season &&
      Number(item.episode) === episodeNumber
    );

    if (!episode) {
      return res.status(404).json({ status: false, message: "Episode not found" });
    }

    const sources = Array.isArray(episode.sources) ? episode.sources : [];
    const directSource = [
      episode.video_url,
      episode.videoUrl,
      episode.stream_url,
      episode.streamUrl,
      ...sources.flatMap((source) => {
        if (typeof source === "string") return [source];
        if (!source || typeof source !== "object") return [];
        return [source.video_url, source.videoUrl, source.stream_url, source.streamUrl, source.url];
      })
    ].find((value) => typeof value === "string" && /^https?:\\/\\//i.test(value));

    // If no stored direct source exists, fetch only the public episode HTML
    // and extract its iframe src. No player/hash resolution is performed.
    const iframeUrl = directSource || await fetchEpisodeIframeSrc(episode.sourceUrl);
    if (!iframeUrl) {
      return res.status(404).json({
        status: false,
        message: "No public iframe or authorized video source found"
      });
    }

    const isHls = /\\.m3u8(?:$|[?#])/i.test(iframeUrl);
    return res.json({
      status: true,
      anime_id: anime.id,
      season,
      episode: episodeNumber,
      title: episode.title || ("Episode " + episodeNumber),
      hls: isHls,
      stream_url: iframeUrl,
      video_url: iframeUrl,
      iframe_url: directSource ? null : iframeUrl,
      poster: episode.videoImage || episode.poster || anime.poster || null,
      sources: {
        video: true,
        audio: isHls
      }
    });
  } catch (error) {
    next(error);
  }
});
router.get("/anime/:id/episode/:season/:episode", async (req, res, next) => {
  try {
    const db = await readDatabase();
    const anime = db.anime.find((item) => item.id === req.params.id || item.slug === req.params.id);
    if (!anime) return res.status(404).json({ error: "Anime not found" });
    const episode = db.episodes.find((e) =>
      e.animeId === anime.id && e.season === Number(req.params.season) && e.episode === Number(req.params.episode)
    );
    if (!episode) return res.status(404).json({ error: "Episode not found" });
    res.json({ anime, episode });
  } catch (error) { next(error); }
});

module.exports = router;
