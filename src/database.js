const fs = require("fs/promises");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "anime-db.json");
const EMPTY_DATABASE = {
  version: 1,
  updatedAt: null,
  anime: [],
  episodes: [],
  movies: []
};

function normalizeDatabase(db) {
  const value = db && typeof db === "object" ? db : {};
  return {
    version: Number(value.version) || 1,
    updatedAt: value.updatedAt || null,
    anime: Array.isArray(value.anime) ? value.anime : [],
    episodes: Array.isArray(value.episodes) ? value.episodes : [],
    movies: Array.isArray(value.movies) ? value.movies : []
  };
}

async function ensureDatabase() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(EMPTY_DATABASE, null, 2));
  }
}

async function readDatabase() {
  await ensureDatabase();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return normalizeDatabase(JSON.parse(raw));
}

let writeQueue = Promise.resolve();

function writeDatabase(db) {
  const nextDb = normalizeDatabase(db);
  writeQueue = writeQueue.then(async () => {
    nextDb.updatedAt = new Date().toISOString();
    const tempPath = DB_PATH + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(nextDb, null, 2));
    await fs.rename(tempPath, DB_PATH);
  });
  return writeQueue;
}

async function updateDatabase(mutator) {
  const db = await readDatabase();
  await mutator(db);
  await writeDatabase(db);
  return db;
}

module.exports = { DB_PATH, EMPTY_DATABASE, readDatabase, writeDatabase, updateDatabase };
