const fs = require("fs/promises");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "anime-db.json");
const EMPTY_DATABASE = {
  version: 2,
  updatedAt: null,
  anime: [],
  episodes: [],
  movies: []
};

function normalizeDatabase(db) {
  const value = db && typeof db === "object" ? db : {};
  return {
    version: Number(value.version) || 2,
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

let mutationQueue = Promise.resolve();

function updateDatabase(mutator) {
  const operation = mutationQueue.then(async () => {
    const db = await readDatabase();
    await mutator(db);
    db.updatedAt = new Date().toISOString();

    const tempPath = DB_PATH + "." + process.pid + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(normalizeDatabase(db), null, 2));
    await fs.rename(tempPath, DB_PATH);
    return db;
  });

  mutationQueue = operation.catch(() => {});
  return operation;
}

async function writeDatabase(db) {
  return updateDatabase(async (current) => {
    Object.assign(current, normalizeDatabase(db));
  });
}

module.exports = { DB_PATH, EMPTY_DATABASE, readDatabase, writeDatabase, updateDatabase };
