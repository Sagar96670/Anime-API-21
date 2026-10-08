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

## Data

Anime records live in `data/anime-db.json`. Episodes are stored separately and linked with `animeId`.

Video `sources` are intentionally empty until an authorized/public video source is configured.

## Sync

The data layer is separated from the API so a future sync job can upsert anime, episodes and movies into the JSON file without changing the API routes.

Do not use this project to bypass access controls or extract protected/hidden video streams from third-party services.
