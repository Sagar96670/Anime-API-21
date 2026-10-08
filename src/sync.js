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

async function syncCatalog(payload) {
  const anime = Array.isArray(payload.anime) ? payload.anime : [];
  const episodes = Array.isArray(payload.episodes) ? payload.episodes : [];
  const movies = Array.isArray(payload.movies) ? payload.movies : [];

  return updateDatabase((db) => {
    const result = { anime: { created: 0, updated: 0 }, episodes: { created: 0, updated: 0 }, movies: { created: 0, updated: 0 } };

    for (const item of anime) {
      if (!item.id || !item.title) continue;
      const status = upsertById(db.anime, {
        ...item,
        id: normalize(item.id),
        title: normalize(item.title),
        slug: normalize(item.slug || item.id)
      });
      result.anime[status]++;
    }

    for (const item of episodes) {
      if (!item.id || !item.animeId || !item.episode) continue;
      const status = upsertById(db.episodes, {
        ...item,
        id: normalize(item.id),
        animeId: normalize(item.animeId),
        season: Number(item.season || 1),
        episode: Number(item.episode)
      });
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
