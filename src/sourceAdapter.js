const https = require("https");
const http = require("http");

const DEFAULT_SITE_URL = "https://www.desidubanime.me";
const REQUEST_TIMEOUT_MS = 20000;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(url, {
      headers: {
        "User-Agent": "Anime-API-21/1.1 (+metadata sync)",
        "Accept": "text/html,application/xhtml+xml,application/json",
        "Accept-Language": "en-US,en;q=0.8"
      }
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error("Source returned HTTP " + response.statusCode));
        }
        resolve(body);
      });
    });
    request.on("error", reject);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Source request timed out"));
    });
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#8217;|&#x2019;/gi, "'")
    .replace(/&#8211;|&#x2013;/gi, "-")
    .replace(/&#8220;|&#x201c;/gi, '"')
    .replace(/&#8221;|&#x201d;/gi, '"')
    .replace(/&#8226;|&#x2022;/gi, "•")
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(base, value) {
  try { return new URL(value, base).href; } catch { return ""; }
}

function slugFromUrl(url) {
  return url.replace(/\/$/, "").split("/").pop() || "";
}

function imageFromBlock(block, base) {
  const match = block.match(/(?:data-src|data-lazy-src|data-original|src)=[\"']([^\"']+)[\"']/i);
  return match ? absoluteUrl(base, match[1]) : "";
}

function extractAnimeCards(html, base) {
  const results = [];
  const seen = new Set();
  const linkRegex = /<a[^>]+href=[\"']([^\"']*\/anime\/[^\"']+)[\"'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html))) {
    const href = absoluteUrl(base, match[1]);
    if (!href || seen.has(href) || href === base + "/anime/" || href.includes("/anime-type/")) continue;

    const block = match[0] + match[2];
    const titleMatch = block.match(/title=[\"']([^\"']+)[\"']/i);
    const title = decodeHtml(titleMatch ? titleMatch[1] : match[2]);
    if (!title || title.length < 2) continue;

    seen.add(href);
    results.push({
      id: slugFromUrl(href),
      slug: slugFromUrl(href),
      title,
      poster: imageFromBlock(block, base),
      sourceUrl: href
    });
  }

  return results;
}

function extractSeasonLinks(html, base) {
  const seasons = [];
  const seen = new Set();
  const regex = /<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const text = decodeHtml(match[2]);
    const seasonMatch = text.match(/\bSeason\s*(\d+)\b/i);
    if (!seasonMatch) continue;

    const season = Number(seasonMatch[1]);
    const url = absoluteUrl(base, match[1]);
    if (!url || !Number.isInteger(season) || season < 1 || season > 100 || seen.has(season)) continue;

    seen.add(season);
    seasons.push({ season, url });
  }

  return seasons.sort((a, b) => a.season - b.season);
}

function extractWatchEpisodes(html, anime, season) {
  const episodes = [];
  const seen = new Set();
  const regex = /<a[^>]+href=["']([^"']*\/watch\/[^"']+)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const hrefValue = String(match[1] || "");
    const episodeMatch =
      hrefValue.match(/(?:episode|ep)[-_]?(\d+)(?:\D|$)/i) ||
      hrefValue.match(/(?:^|[-_/])e(?:pisode)?[-_]?0*(\d+)(?:[-_/]|$)/i);

    if (!episodeMatch) continue;

    const episode = Number(episodeMatch[1]);
    if (!Number.isInteger(episode) || episode < 1) continue;

    const url = absoluteUrl(anime.sourceUrl, hrefValue);
    const key = anime.id + "-s" + season + "-e" + episode;

    if (!url || seen.has(key)) continue;

    seen.add(key);
    episodes.push({
      id: key,
      animeId: anime.id,
      season,
      episode,
      title: "Episode " + episode,
      sourceUrl: url,
      sources: []
    });
  }

  return episodes.sort((a, b) => a.episode - b.episode);
}

function extractSeasonNumbers(html) {
  const seasons = new Set();
  const regex = /\bSeason\s*(\d+)\b/gi;
  let match;

  while ((match = regex.exec(decodeHtml(html)))) {
    const season = Number(match[1]);
    if (Number.isInteger(season) && season >= 1 && season <= 100) {
      seasons.add(season);
    }
  }

  return [...seasons].sort((a, b) => a - b);
}

function extractCatalogPageUrls(html, base) {
  const urls = new Set();
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const url = absoluteUrl(base, match[1]);
    if (!url) continue;

    try {
      const parsed = new URL(url);
      const basePath = new URL(base + "/anime/").pathname;
      const path = parsed.pathname.replace(/\/+$/, "");
      const matchPage = path.match(/\/anime\/page\/(\d+)$/i);

      if (path === basePath.replace(/\/+$/, "") || matchPage) {
        urls.add(url.replace(/\/+$/, "") + "/");
      }
    } catch {}
  }

  return [...urls];
}

function extractEpisodes(html, anime, season) {
  // DesiDubAnime currently renders episode items with several different
  // WordPress/theme layouts. Prefer episode-numbered URLs/text, and do not
  // require the literal word "Episode" to be present in the anchor text.
  const episodes = [];
  const seen = new Set();
  const regex = /<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>([\s\S]{0,1200}?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const anchorText = decodeHtml(match[2]);
    const hrefValue = String(match[1] || "");
    const episodeMatch =
      anchorText.match(/\bEpisode\s*(\d+)\b/i) ||
      anchorText.match(/\bEp(?:isode)?\.?\s*(\d+)\b/i) ||
      hrefValue.match(/(?:episode|ep)[-_/]?(\d+)(?:\D|$)/i) ||
      hrefValue.match(/(?:^|[-_/])e(?:pisode)?[-_]?0*(\d+)(?:[-_/]|$)/i);

    if (!episodeMatch) continue;

    const episode = Number(episodeMatch[1]);
    if (!Number.isInteger(episode) || episode < 1) continue;

    const url = absoluteUrl(anime.sourceUrl, match[1]);
    if (!url || url === anime.sourceUrl) continue;

    const key = anime.id + "-s" + season + "-e" + episode;
    if (seen.has(key)) continue;

    seen.add(key);
    episodes.push({
      id: key,
      animeId: anime.id,
      season,
      episode,
      title: anchorText.replace(/\s+/g, " ").trim(),
      sourceUrl: url,
      sources: []
    });
  }

  return episodes.sort((a, b) => a.episode - b.episode);
}

async function scrapeAnimePage(anime) {
  const html = await fetchText(anime.sourceUrl);
  const seasonLinks = extractSeasonLinks(html, anime.sourceUrl);
  const seasonNumbers = extractSeasonNumbers(html);
  const seasons = seasonLinks.length
    ? seasonLinks
    : [{ season: 1, url: anime.sourceUrl }];
  const episodes = [];
  let allSeasonsFetched = seasonLinks.length > 0 || seasonNumbers.length <= 1;

  for (const seasonInfo of seasons) {
    try {
      const seasonHtml = seasonInfo.url === anime.sourceUrl ? html : await fetchText(seasonInfo.url);
      const extracted = extractEpisodes(seasonHtml, anime, seasonInfo.season);
      const watchEpisodes = extractWatchEpisodes(seasonHtml, anime, seasonInfo.season);
      const merged = new Map(extracted.map((item) => [item.id, item]));
      for (const item of watchEpisodes) {
        merged.set(item.id, { ...(merged.get(item.id) || {}), ...item });
      }
      episodes.push(...merged.values());
    } catch (error) {
      allSeasonsFetched = false;
      console.error("Skipping season", seasonInfo.season, "for", anime.sourceUrl, error.message);
    }
  }

  return {
    anime: {
      ...anime,
      seasons: seasonLinks.length
        ? seasons.map((item) => item.season)
        : (seasonNumbers.length ? seasonNumbers : [1]),
      sourceSyncComplete: allSeasonsFetched
    },
    episodes
  };
}

async function scrapeDesiDubAnime(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const maxPages = Math.min(Math.max(Number(process.env.SOURCE_MAX_PAGES) || 100, 1), 100);
  const concurrency = Math.min(Math.max(Number(process.env.SYNC_CONCURRENCY) || 4, 1), 8);
  const anime = [];
  const seen = new Set();

  const catalogPages = new Map([[1, base + "/anime/"]]);

  try {
    const firstHtml = await fetchText(base + "/anime/");
    for (const item of extractAnimeCards(firstHtml, base)) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        anime.push(item);
      }
    }

    for (const url of extractCatalogPageUrls(firstHtml, base)) {
      const match = url.match(/\/anime\/page\/(\d+)\/?$/i);
      const page = match ? Number(match[1]) : 1;
      if (page >= 1 && page <= maxPages) catalogPages.set(page, url);
    }
  } catch (error) {
    console.error("Failed to fetch catalog page 1:", error.message);
  }

  // Discover the remaining numbered pages in parallel. The site currently
  // exposes a finite pagination range; stop naturally when a page is empty.
  const pageNumbers = [];
  for (let page = 2; page <= maxPages; page++) pageNumbers.push(page);

  for (let i = 0; i < pageNumbers.length; i += concurrency) {
    const batch = pageNumbers.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async (page) => {
      const url = catalogPages.get(page) || base + "/anime/page/" + page + "/";
      try {
        return { page, html: await fetchText(url) };
      } catch (error) {
        console.error("Skipping catalog page", page, error.message);
        return null;
      }
    }));

    let emptyPages = 0;

    for (const result of results) {
      if (!result) continue;

      const items = extractAnimeCards(result.html, base);
      if (!items.length) {
        emptyPages++;
        continue;
      }

      for (const item of items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          anime.push(item);
        }
      }
    }

    // Once a full batch is empty, later numbered pages are not useful.
    if (emptyPages === batch.length) break;
  }

  const enrichedAnime = [];
  const episodes = [];

  for (let i = 0; i < anime.length; i += concurrency) {
    const batch = anime.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((item) => scrapeAnimePage(item).catch((error) => {
      console.error("Skipping anime page:", item.sourceUrl, error.message);
      return null;
    })));

    for (const result of results) {
      if (!result) continue;
      enrichedAnime.push(result.anime);
      episodes.push(...result.episodes);
    }
  }

  let movies = [];
  try {
    const movieHtml = await fetchText(base + "/anime-type/movie/");
    const movieItems = extractAnimeCards(movieHtml, base);
    movies = movieItems.map((item) => ({
      ...item,
      type: "movie"
    }));
  } catch (error) {
    console.error("Skipping movie catalog:", error.message);
  }

  return { anime: enrichedAnime, episodes, movies };
}

async function fetchCatalogFromUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("A valid HTTP(S) metadata feed URL is required");
  }

  if (new URL(url).hostname === new URL(DEFAULT_SITE_URL).hostname) {
    return scrapeDesiDubAnime(DEFAULT_SITE_URL);
  }

  const payload = JSON.parse(await fetchText(url));
  if (!payload || typeof payload !== "object") {
    throw new Error("Metadata feed must return a JSON object");
  }

  return {
    anime: Array.isArray(payload.anime) ? payload.anime : [],
    episodes: Array.isArray(payload.episodes) ? payload.episodes : [],
    movies: Array.isArray(payload.movies) ? payload.movies : []
  };
}

module.exports = { fetchCatalogFromUrl, scrapeDesiDubAnime };
