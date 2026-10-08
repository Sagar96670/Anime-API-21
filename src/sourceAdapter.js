const https = require("https");
const http = require("http");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(url, { headers: { "User-Agent": "Anime-API-21/1.0" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error("Source returned HTTP " + response.statusCode));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Source did not return valid JSON"));
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(15000, () => request.destroy(new Error("Source request timed out")));
  });
}

async function fetchCatalogFromUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("A valid HTTP(S) metadata feed URL is required");
  }
  const payload = await fetchJson(url);
  if (!payload || typeof payload !== "object") {
    throw new Error("Metadata feed must return a JSON object");
  }
  return {
    anime: Array.isArray(payload.anime) ? payload.anime : [],
    episodes: Array.isArray(payload.episodes) ? payload.episodes : [],
    movies: Array.isArray(payload.movies) ? payload.movies : []
  };
}

module.exports = { fetchCatalogFromUrl };
