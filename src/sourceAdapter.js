const https = require("https");
const http = require("http");

const DEFAULT_SITE_URL = "https://www.desidubanime.me";
const REQUEST_TIMEOUT_MS = 20000;

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      return reject(new Error("Too many redirects while fetching source"));
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error("Invalid source URL"));
    }

    const client = parsedUrl.protocol === "https:" ? https : http;
    const request = client.get(parsedUrl, {
      headers: {
        "User-Agent": "Anime-API-21/1.1 (+metadata sync)",
        "Accept": "text/html,application/xhtml+xml,application/json",
        "Accept-Language": "en-US,en;q=0.8"
      }
    }, (response) => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          return reject(new Error("Source returned HTTP " + status + " without a redirect location"));
        }
        return resolve(fetchText(new URL(location, parsedUrl).href, redirects + 1));
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (status < 200 || status >= 300) {
          return reject(new Error("Source returned HTTP " + status));
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
  const source = String(html || "");
  const anchorRegex = /<a\b([^>]*)>/gi;

  function readAttribute(attributes, name) {
    const regex = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let attribute;
    while ((attribute = regex.exec(String(attributes || "")))) {
      if (attribute[1].toLowerCase() === name.toLowerCase()) {
        return attribute[2] || attribute[3] || attribute[4] || "";
      }
    }
    return "";
  }

  function humanizeSlug(slug) {
    return decodeHtml(String(slug || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
  }

  let match;
  while ((match = anchorRegex.exec(source))) {
    const attributes = match[1] || "";
    const hrefValue = readAttribute(attributes, "href");
    const href = absoluteUrl(base, hrefValue);
    if (!href) continue;

    let parsed;
    try { parsed = new URL(href); } catch { continue; }
    if (parsed.hostname !== new URL(base).hostname) continue;

    const pathname = parsed.pathname.replace(/\/+$/, "");
    const lowerPath = pathname.toLowerCase();
    const rawId = slugFromUrl(pathname);
    const id = lowerPath.startsWith("/watch/")
      ? rawId.replace(/-(?:season-\d+-)?episode-\d+(?:-\d+)?$/i, "").replace(/-(?:season-\d+)-episode-\d+$/i, "")
      : rawId;
    if (
      !pathname ||
      pathname === "/" ||
      lowerPath === "/anime" ||
      /\/(page|anime-type|category|tag|author|genre|genres|search|login|register|homepage|schedule|random|language|languages)(\/|$)/i.test(lowerPath) ||
      /\.(?:jpg|jpeg|png|webp|gif|css|js|xml|pdf)$/i.test(lowerPath) ||
      /^(page|anime|movie|movies|all|latest|popular|completed|ongoing|home|login|register|search)$/i.test(id)
    ) continue;

    const nearby = source.slice(match.index, Math.min(source.length, match.index + 2600));
    const closeAnchor = nearby.search(/<\/a\s*>/i);
    const inner = closeAnchor >= 0 ? nearby.slice(match[0].length, closeAnchor) : nearby.slice(match[0].length, 900);
    const imageTag = (nearby.match(/<img\b[^>]*>/i) || [])[0] || "";
    const heading = (nearby.match(/<(?:h[1-6]|strong)\b[^>]*>[\s\S]*?<\/(?:h[1-6]|strong)>/i) || [])[0] || "";
    const title = decodeHtml(
      readAttribute(attributes, "title") ||
      readAttribute(attributes, "aria-label") ||
      readAttribute(imageTag, "alt") ||
      readAttribute(imageTag, "title") ||
      heading ||
      inner ||
      humanizeSlug(id)
    );
    const hasImage = /<img\b/i.test(nearby.slice(0, 1400));
    const isAnimePath = /\/(?:anime|watch)\/[^/]+/i.test(pathname);
    if ((!hasImage && !isAnimePath) || !id || !title || title.length < 2) continue;

    const normalizedUrl = parsed.origin + pathname + parsed.search;
    if (seen.has(normalizedUrl)) continue;
    seen.add(normalizedUrl);
    results.push({
      id,
      slug: id,
      title: title.length > 180 ? humanizeSlug(id) : title,
      poster: imageFromBlock(nearby.slice(0, Math.min(1600, nearby.length)), base),
      sourceUrl: normalizedUrl
    });
  }

  return results;
}

function extractSeasonLinks(html, base) {
  const seasons = [];
  const seen = new Set();
  const regex = /<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let match;

  // A season mentioned in a recommendation/sidebar is not evidence that
  // the current anime has that season. Only accept links whose URL belongs
  // to the same series as the page being scraped.
  function seriesSlug(value) {
    let slug = slugFromUrl(new URL(value, base).pathname).toLowerCase();
    slug = slug
      .replace(/-episode-\d+(?:-\d+)?$/i, "")
      .replace(/-(?:season-)?\d+(?:st|nd|rd|th)?-season$/i, "")
      .replace(/-season-\d+$/i, "")
      .replace(/-(?:ova|ona|special)$/i, "");
    return slug;
  }

  const currentSeries = seriesSlug(base);
  while ((match = regex.exec(html))) {
    const text = decodeHtml(match[2]);
    const seasonMatch = text.match(/\bSeason\s*(\d+)\b/i);
    if (!seasonMatch) continue;

    const season = Number(seasonMatch[1]);
    const url = absoluteUrl(base, match[1]);
    if (!url || !Number.isInteger(season) || season < 1 || season > 100 || seen.has(season)) continue;
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== new URL(base).hostname) continue;
      if (seriesSlug(url) !== currentSeries) continue;
    } catch {
      continue;
    }

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

function extractCatalogPageUrls(html, base) {
  const urls = new Map();
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html))) {
    const url = absoluteUrl(base, match[1]);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/+$/, "");
      const pageMatch = path.match(/\/anime\/page\/(\d+)$/i);
      if (!pageMatch) continue;
      const page = Number(pageMatch[1]);
      if (!Number.isInteger(page) || page < 2) continue;
      urls.set(page, url.replace(/\/+$/, "") + "/");
    } catch {}
  }

  return [...urls.entries()].sort((a, b) => a[0] - b[0]).map(([, url]) => url);
}

function extractEpisodes(html, anime, season) {
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
  // Only explicit season navigation links are evidence of multiple seasons.
  // Scanning the entire page text picks up unrelated recommendation titles
  // and incorrectly assigns the same seasons to almost every anime.
  const seasons = seasonLinks.length ? seasonLinks : [{ season: 1, url: anime.sourceUrl }];
  const episodes = [];
  let allSeasonsFetched = true;

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
      seasons: seasons.map((item) => item.season),
      sourceSyncComplete: allSeasonsFetched
    },
    episodes
  };
}

async function scrapeDesiDubAnime(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const concurrency = Math.min(Math.max(Number(process.env.SYNC_CONCURRENCY) || 4, 1), 8);
  const anime = [];
  const seen = new Set();
  const pendingPages = new Map([[1, base + "/anime/"]]);
  const queuedUrls = new Set(pendingPages.values());
  const fetchedUrls = new Set();

  while (pendingPages.size) {
    const batch = [...pendingPages.entries()].slice(0, concurrency);
    for (const [page, url] of batch) pendingPages.delete(page);
    const results = await Promise.all(batch.map(async ([page, url]) => {
      try { return { page, url, html: await fetchText(url) }; }
      catch (error) {
        console.error("Skipping catalog page", page, error.message);
        return null;
      }
    }));

    for (const result of results) {
      if (!result || fetchedUrls.has(result.url)) continue;
      fetchedUrls.add(result.url);
      for (const item of extractAnimeCards(result.html, base)) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          anime.push(item);
        }
      }
      const discoveredPages = extractCatalogPageUrls(result.html, base);
      for (const url of discoveredPages) {
        if (queuedUrls.has(url) || fetchedUrls.has(url)) continue;
        const match = url.match(/\/anime\/page\/(\d+)\/?$/i);
        if (!match) continue;
        const page = Number(match[1]);
        if (!Number.isInteger(page) || page < 2) continue;
        queuedUrls.add(url);
        pendingPages.set(page + ":" + url, url);
      }
      console.log("Catalog page " + result.page + " yielded " + extractAnimeCards(result.html, base).length + " anime and exposed " + discoveredPages.length + " pagination pages.");
    }
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
    movies = extractAnimeCards(movieHtml, base).map((item) => ({ ...item, type: "movie" }));
  } catch (error) {
    console.error("Skipping movie catalog:", error.message);
  }

  return { anime: enrichedAnime, episodes, movies };
}

async function fetchCatalogFromUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("A valid HTTP(S) metadata feed URL is required");
  if (new URL(url).hostname === new URL(DEFAULT_SITE_URL).hostname) return scrapeDesiDubAnime(DEFAULT_SITE_URL);
  const payload = JSON.parse(await fetchText(url));
  if (!payload || typeof payload !== "object") throw new Error("Metadata feed must return a JSON object");
  return {
    anime: Array.isArray(payload.anime) ? payload.anime : [],
    episodes: Array.isArray(payload.episodes) ? payload.episodes : [],
    movies: Array.isArray(payload.movies) ? payload.movies : []
  };
}

module.exports = { fetchCatalogFromUrl, scrapeDesiDubAnime };
