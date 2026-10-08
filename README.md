# Anime API 21

Lightweight anime catalog API built with Node.js + Express + JSON.

## No MongoDB

The project uses `data/anime-db.json` as its database. No MongoDB or other database server is required.

## Setup

    npm install
    npm start

Development:

    npm run dev

Server: http://localhost:3000

## API

- GET /api/health
- GET /api/catalog?page=1&limit=20&search=naruto
- GET /api/anime/:id
- GET /api/anime/:id/seasons
- GET /api/anime/:id/episodes?season=1
- GET /api/anime/:id/episode/:season/:episode
- GET /api/movies?page=1&limit=20&search=...
- GET /api/movie/:id

## Sync

Local JSON:

    npm run sync -- data/example-catalog.json

Remote metadata feed:

    npm run sync:url -- https://your-authorized-source.example/catalog.json

Automatic live sync:

When `METADATA_FEED_URL` is configured, `npm start` starts the API and the automatic metadata sync together. The first sync runs when the server starts, then repeats every `SYNC_INTERVAL_MINUTES` (minimum 5 minutes, default 60). No manual sync is required for normal operation.

The remote feed must return JSON shaped as:

    {
      "anime": [],
      "episodes": [],
      "movies": []
    }

Records are upserted by ID, so rerunning a feed updates existing records instead of creating duplicates.

## Source policy

The source adapter is for public or authorized metadata feeds. It does not extract hidden/protected video streams, bypass access controls, or resolve third-party player internals.

Video `sources` can be populated separately when the source is authorized for use.


## Admin sync

Set `ADMIN_API_KEY` to a long random secret.

Manual sync:

    curl -X POST http://localhost:3000/api/admin/sync -H "x-api-key: YOUR_SECRET"

Sync status:

    curl http://localhost:3000/api/admin/sync/status -H "x-api-key: YOUR_SECRET"

Both endpoints are protected by the API key and return 401 without the correct key.
