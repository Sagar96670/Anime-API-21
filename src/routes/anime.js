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
