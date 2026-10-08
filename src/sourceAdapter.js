const https = require("https");
const http = require("http");

const DEFAULT_SITE_URL = "https://www.desidubanime.me";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(url, {
      headers: {
        "User-Agent": "Anime-API-21/1.0 (+metadata sync)",
        "Accept": "text/html,application/xhtml+xml,application/json"
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
    request.setTimeout(20000, () => request.destroy(new Error("Source request timed out")));
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#8217;|&#x2019;/gi, "'")
    .replace(/&#8211;|&#x2013;/gi, "-")
    .replace(/&#8220;|&#x201c;/gi, '"')
    .replace(/&#8221;|&#x201d;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(base, value) {
  try { return new URL(value, base).href; } catch { return ""; }
}

function firstMatch(text, regex) {
  const match = text.match(regex);
  return match ? decodeHtml(match[1] || match[2]) : "";
}

function imageFromBlock(block, base) {
  const match = block.match(/(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i);
  return match ? absoluteUrl(base, match[1]) : "";
}

function slugFromUrl(url) {
  return url.replace(/\/$/, "").split("/").pop() || "";
}

function extractAnimeCards(html, base) {
  const results = [];
  const seen = new Set();
  const linkRegex = /<a[^>]+href=["']([^"']*\/anime\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html))) {
    const href = absoluteUrl(base, match[1]);
    if (!href || seen.has(href) || href === base + "/anime/" || href.includes("/anime-type/")) continue;

    const block = match[0] + match[2];
    const title = firstMatch(block, /title=["']([^"']+)["']/i) || decodeHtml(match[2]);
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

function extractEpisodes(html, anime) {
  const episodes = [];
  const seen = new Set();
  const regex = /href=["']([^"']+)["'][^>]*>([\s\S]{0,500}?Episode\s*(\d+)[^<]*)</gi;
  let match;

  while ((match = regex.exec(html))) {
    const episode = Number(match[3]);
    if (!Number.isFinite(episode)) continue;
    const url = absoluteUrl(anime.sourceUrl, match[1]);
    const key = anime.id + "-s1-e" + episode;
    if (seen.has(key)) continue;
    seen.add(key);
    episodes.push({
      id: key,
      animeId: anime.id,
      season: 1,
      episode,
      title: decodeHtml(match[2]).replace(/\s+/g, " ").trim(),
      sourceUrl: url,
      sources: []
    });
  }

  return episodes.sort((a, b) => a.episode - b.episode);
}

async function scrapeDesiDubAnime(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const maxPages = Math.min(Math.max(Number(process.env.SOURCE_MAX_PAGES) || 5, 1), 20);
  const anime = [];
  const seen = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const url = page === 1 ? base + "/anime/" : base + "/anime/page/" + page + "/";
    const html = await fetchText(url);
    for (const item of extractAnimeCards(html, base)) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        anime.push(item);
      }
    }
  }

  const episodes = [];
  for (const item of anime) {
    try {
      const html = await fetchText(item.sourceUrl);
      episodes.push(...extractEpisodes(html, item));
    } catch (error) {
      console.error("Skipping anime page:", item.sourceUrl, error.message);
    }
  }

  return { anime, episodes, movies: [] };
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
