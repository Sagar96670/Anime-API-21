# Anime API 21

Lightweight anime catalog API built with Node.js + Express + JSON.

## Highlights

- No MongoDB or database server.
- JSON file database at `data/anime-db.json`.
- Public metadata sync from the configured source.
- Desi Dub Anime adapter for title, poster, season list and episode metadata.
- Automatic sync on startup plus a configurable interval.
- Multi-season discovery instead of assuming every episode is Season 1.
- Serialized JSON writes to avoid concurrent sync corruption.
- Stale episodes are removed when a successfully synced source page no longer lists them.
- CORS enabled for frontend/mobile clients.
- Video `sources` remain empty unless you provide a public/authorized source. The stream endpoint returns only an explicitly configured authorized `video_url`; it does not discover hidden player URLs.

The target source currently used by default is [Desi Dub Anime](https://www.desidubanime.me). Its public pages expose multiple season buttons and episode listings, which the adapter uses for metadata synchronization.

## Setup

```bash
npm install
npm start
```

Development:

```bash
npm run dev
```

Server: `http://localhost:3000`

## API

- `GET /api/health`
- `GET /api/catalog?page=1&limit=20&search=naruto`
- `GET /api/anime/:id`
- `GET /api/anime/:id/seasons`
- `GET /api/anime/:id/episodes?season=1`
- `GET /api/anime/:id/episode/:season/:episode`
- `GET /api/anime/:id/episode/:season/:episode/stream` (authorized direct/HLS source)
- `GET /api/hls-proxy?url=...` (authorized hosts only)
- `GET /api/movies?page=1&limit=20&search=...`
- `GET /api/movie/:id`
- `GET /episode.html?id=:animeId&season=:season&episode=:episode` (existing HLS.js player)

## Automatic sync

The server defaults to the Desi Dub Anime metadata source when `METADATA_FEED_URL` is not set.

On startup:

1. The API starts immediately.
2. A metadata sync begins in the background.
3. The sync repeats every `SYNC_INTERVAL_MINUTES`.
4. A running sync cannot overlap with another sync.
5. The JSON database is updated atomically.

Defaults:

```env
METADATA_FEED_URL=https://www.desidubanime.me
SOURCE_MAX_PAGES=20
SYNC_CONCURRENCY=4
SYNC_INTERVAL_MINUTES=60
```

`SOURCE_MAX_PAGES` is capped at 20 and `SYNC_CONCURRENCY` is capped at 8.

## Season handling

For each anime page, the adapter looks for public `Season N` links. When those links are available, it fetches each season page and stores episodes using stable IDs such as:

```text
anime-slug-s1-e1
anime-slug-s2-e1
anime-slug-s3-e1
```

If no season links are found, the page safely falls back to Season 1.

## Sync consistency

Each successful source page is marked internally as source-sync-complete. Only those successfully synchronized anime records participate in stale-episode cleanup. If a source request fails, the existing local episode data is preserved rather than being wiped accidentally.

JSON mutations are serialized and written through a temporary file followed by an atomic rename.

## Local JSON feed

```bash
npm run sync -- data/example-catalog.json
```

## Remote JSON feed

```bash
npm run sync:url -- https://your-authorized-source.example/catalog.json
```

Remote JSON feeds must return:

```json
{
  "anime": [],
  "episodes": [],
  "movies": []
}
```

Records are upserted by ID.

## Source policy

The adapter is for public or authorized metadata. It collects metadata such as title, poster, season and episode listings. It does not bypass access controls or extract hidden/protected third-party video streams or player internals.

If you have a public or authorized video provider, store its HLS/MP4 URL in episode `video_url` or `sources`. For HLS proxying, set `AUTHORIZED_VIDEO_HOSTS` to the provider hostname(s). Real HLS quality/audio tracks are discovered by the existing frontend player from the returned `.m3u8` manifest; the API does not invent quality or language options.

## Admin sync

Set `ADMIN_API_KEY` to a long random secret.

Manual sync:

```bash
curl -X POST http://localhost:3000/api/admin/sync \
  -H "x-api-key: YOUR_SECRET"
```

Status:

```bash
curl http://localhost:3000/api/admin/sync/status \
  -H "x-api-key: YOUR_SECRET"
```

Both endpoints require the configured API key.

## Existing player

The original custom episode player is preserved at `public/episode.html` and is served by Express. It calls the new episode and stream endpoints directly. HLS playback uses the authorized `/api/hls-proxy` only when the stream response declares `hls: true`; direct authorized MP4 sources are loaded directly. The player uses real HLS quality and audio tracks from the manifest and does not invent options.


## Production deployment

The server listens on `0.0.0.0` and uses the platform-provided `PORT`.

Docker:

```bash
docker build -t anime-api-21 .
docker run -d \
  --name anime-api-21 \
  -p 3000:3000 \
  -v anime-api-data:/app/data \
  -e ADMIN_API_KEY="YOUR_LONG_RANDOM_SECRET" \
  anime-api-21
```

The JSON database lives in `/app/data`. Keep that directory on a persistent volume when using Docker or a container platform; otherwise a replacement container can lose local catalog data.

Recommended production environment:

```env
NODE_ENV=production
PORT=3000
METADATA_FEED_URL=https://www.desidubanime.me
SOURCE_MAX_PAGES=20
SYNC_CONCURRENCY=4
SYNC_INTERVAL_MINUTES=60
ADMIN_API_KEY=YOUR_LONG_RANDOM_SECRET
```

Use the deployment platform's persistent-disk/volume feature for `/app/data`. The health endpoint is:

```
GET /api/health
```

A successful health response includes current anime, episode and movie counts plus sync state.


## Vercel deployment

Vercel follows the same lightweight architecture as the old API: there is **no MongoDB, no Vercel Blob and no external JSON storage**.

The JSON database is:

```text
data/anime-db.json
```

`vercel.json` bundles that file with the `server.js` serverless function:

```json
{
  "functions": {
    "server.js": {
      "includeFiles": "data/anime-db.json"
    }
  }
}
```

On Vercel, the deployed JSON is treated as bundled/read-only persistent data. Runtime changes are only kept in the current function instance and are not a replacement for persistent storage.

### Updating the Vercel catalog

To permanently refresh the catalog without adding another database or storage service:

1. Run the metadata sync locally:
   ```bash
   npm install
   npm run sync
   ```
2. Check the generated `data/anime-db.json`.
3. Commit and push the updated JSON to GitHub.
4. Vercel redeploys the project and bundles the new JSON.

This keeps the deployment simple and matches the old API's JSON-file approach.

### Automatic sync limitation

A normal Vercel serverless function is not a permanently running Node.js process, so the local `setInterval` scheduler is intentionally disabled on Vercel. Without an external scheduler, database service, Blob storage, or another persistent store, a serverless runtime cannot permanently write the refreshed JSON back into the deployment.

Local/Docker/Render deployments can still use the existing automatic sync interval.

### Important

The synchronizer processes public or authorized metadata only. It does not bypass protected video players or extract hidden third-party video streams.

## Render deployment

The repository includes `render.yaml` for a Docker-based Render deployment.

1. Create a Render account and connect the GitHub repository.
2. Create a new Blueprint and select `Anime-API-21`.
3. Render reads `render.yaml`, builds the existing Docker image, and exposes the service.
4. The configuration uses `/api/health` as the health check.
5. The JSON database is stored on a persistent disk mounted at `/app/data`.
6. `ADMIN_API_KEY` is generated by Render instead of being committed to Git.

After deployment, verify:

```text
GET https://YOUR-RENDER-DOMAIN/api/health
GET https://YOUR-RENDER-DOMAIN/api/catalog?page=1&limit=20
```

The first metadata sync runs in the background after startup and then repeats according to `SYNC_INTERVAL_MINUTES`.

### Important

A persistent disk is required because the application deliberately uses a JSON file instead of MongoDB or another database server. Without persistent storage, replacing the container can reset the local catalog.

The public metadata synchronizer only handles public/authorized metadata. It does not bypass protected video players or extract hidden third-party streams.
