const { updateDatabase } = require("./database");

function normalize(value) {
  return String(value ?? "").trim();
}

function upsertById(list, item) {
  const index = list.findIndex((current) => current.id === item.id);
  if (index === -1) {
    list.push(item);
    return "created";
  }
  list[index] = { ...list[index], ...item };
  return "updated";
}

function cleanEpisodes(episodes) {
  const seen = new Set();
  return episodes.filter((item) => {
    if (!item.id || !item.animeId || !Number.isInteger(Number(item.season)) || !Number.isInteger(Number(item.episode))) return false;
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function syncCatalog(payload) {
  const anime = Array.isArray(payload.anime) ? payload.anime : [];
  const episodes = cleanEpisodes(Array.isArray(payload.episodes) ? payload.episodes : []);
  const movies = Array.isArray(payload.movies) ? payload.movies : [];

  return updateDatabase((db) => {
    const result = {
      anime: { created: 0, updated: 0 },
      episodes: { created: 0, updated: 0, removed: 0 },
      movies: { created: 0, updated: 0 }
    };

    const syncedAnimeIds = new Set();

    for (const item of anime) {
      if (!item.id || !item.title) continue;
      const normalized = {
        ...item,
        id: normalize(item.id),
        title: normalize(item.title),
        slug: normalize(item.slug || item.id),
        seasons: Array.isArray(item.seasons)
          ? [...new Set(item.seasons.map(Number).filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b)
          : []
      };
      const status = upsertById(db.anime, normalized);
      if (normalized.sourceSyncComplete) syncedAnimeIds.add(normalized.id);
      result.anime[status]++;
    }

    const incomingEpisodeIds = new Set(episodes.map((item) => normalize(item.id)));

    if (syncedAnimeIds.size) {
      const before = db.episodes.length;
      db.episodes = db.episodes.filter((item) => {
        if (!syncedAnimeIds.has(item.animeId)) return true;
        return incomingEpisodeIds.has(item.id);
      });
      result.episodes.removed = before - db.episodes.length;
    }

    for (const item of episodes) {
      if (!item.id || !item.animeId) continue;
      const existing = db.episodes.find((current) => current.id === normalize(item.id));
      const incomingSources = Array.isArray(item.sources) ? item.sources : [];
      const normalized = {
        ...(existing || {}),
        ...item,
        id: normalize(item.id),
        animeId: normalize(item.animeId),
        season: Number(item.season),
        episode: Number(item.episode),
        sources: incomingSources.length
          ? incomingSources
          : (Array.isArray(existing?.sources) ? existing.sources : [])
      };
      const status = upsertById(db.episodes, normalized);
      result.episodes[status]++;
    }

    for (const item of movies) {
      if (!item.id || !item.title) continue;
      const status = upsertById(db.movies, {
        ...item,
        id: normalize(item.id),
        title: normalize(item.title),
        slug: normalize(item.slug || item.id)
      });
      result.movies[status]++;
    }

    return result;
  });
}

module.exports = { syncCatalog };
