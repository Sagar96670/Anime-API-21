const express = require("express");
const { readDatabase } = require("../database");

const router = express.Router();

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
    const seasons = db.episodes.filter((episode) => episode.animeId === anime.id)
      .reduce((map, episode) => {
        const key = String(episode.season ?? 1);
        if (!map[key]) map[key] = { season: Number(key), episodeCount: 0 };
        map[key].episodeCount++;
        return map;
      }, {});
    res.json(Object.values(seasons).sort((a, b) => a.season - b.season));
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
      return res.status(404).json({
        status: false,
        message: "Anime not found"
      });
    }

    const season = Number(req.params.season);
    const episodeNumber = Number(req.params.episode);

    if (
      !Number.isInteger(season) ||
      season < 1 ||
      !Number.isInteger(episodeNumber) ||
      episodeNumber < 1
    ) {
      return res.status(400).json({
        status: false,
        message: "Invalid season or episode number"
      });
    }

    const episode = db.episodes.find((item) =>
      item.animeId === anime.id &&
      Number(item.season) === season &&
      Number(item.episode) === episodeNumber
    );

    if (!episode) {
      return res.status(404).json({
        status: false,
        message: "Episode not found"
      });
    }

    // Video section: only use a direct/authorized source already stored in the JSON DB.
    // No hidden player/hash extraction is performed here.
    const sources = Array.isArray(episode.sources) ? episode.sources : [];
    const candidates = [
      episode.video_url,
      episode.videoUrl,
      episode.stream_url,
      episode.streamUrl,
      ...sources.flatMap((source) => {
        if (typeof source === "string") return [source];
        if (!source || typeof source !== "object") return [];
        return [source.video_url, source.videoUrl, source.stream_url, source.streamUrl, source.url];
      })
    ].filter((value) => typeof value === "string" && /^https?:\\/\\//i.test(value));

    const videoUrl = candidates[0];

    if (!videoUrl) {
      return res.status(404).json({
        status: false,
        message: "No authorized video source is configured for this episode"
      });
    }

    const hls = /\\.m3u8(?:$|[?#])/i.test(videoUrl);
    const poster = episode.videoImage || episode.poster || anime.poster || null;

    return res.json({
      status: true,
      anime_id: anime.id,
      season,
      episode: episodeNumber,
      title: episode.title || ("Episode " + episodeNumber),
      hls,
      video_url: videoUrl,
      poster,
      secured_link: episode.secured_link || episode.securedLink || null,
      sources: {
        video: true,
        audio: hls
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
