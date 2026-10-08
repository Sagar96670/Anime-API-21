const express = require("express");
const { readDatabase } = require("../database");
const { ensureDataReady } = require("../dataReady");

const router = express.Router();

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

module.exports = router;
