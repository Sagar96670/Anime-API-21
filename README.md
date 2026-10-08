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
- Video `sources` remain empty unless you provide a public/authorized source.

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
- `GET /api/movies?page=1&limit=20&search=...`
- `GET /api/movie/:id`

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
SOURCE_MAX_PAGES=5
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

If you have a public or authorized video provider, its URLs can be stored in episode `sources`.

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
