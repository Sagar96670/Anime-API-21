const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "anime-db.json");
// Vercel sets VERCEL=1 during both build and runtime. During the build we
// must write the generated catalogue into data/anime-db.json so it is bundled
// with the function; only runtime invocations should use in-memory writes.
const IS_VERCEL_RUNTIME =
  process.env.VERCEL === "1" && process.env.VERCEL_BUILD_SYNC !== "1";

const EMPTY_DATABASE = {
  version: 2,
  updatedAt: null,
  anime: [],
  episodes: [],
  movies: []
};

let bundledDatabase = null;
let memoryDatabase = null;

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

function loadBundledDatabase() {
  if (!bundledDatabase) {
    try {
      bundledDatabase = normalizeDatabase(
        require(path.resolve(DB_PATH))
      );
    } catch {
      bundledDatabase = normalizeDatabase(EMPTY_DATABASE);
    }
  }

  return normalizeDatabase(bundledDatabase);
}

function ensureLocalDatabase() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify(EMPTY_DATABASE, null, 2)
    );
  }
}

function readLocalDatabase() {
  ensureLocalDatabase();

  return normalizeDatabase(
    JSON.parse(fs.readFileSync(DB_PATH, "utf8"))
  );
}

function readDatabase() {
  if (IS_VERCEL_RUNTIME) {
    // Vercel deployments bundle the JSON file with the serverless function.
    // Runtime writes are intentionally not treated as persistent storage.
    return memoryDatabase
      ? normalizeDatabase(memoryDatabase)
      : loadBundledDatabase();
  }

  return readLocalDatabase();
}

function writeLocalDatabase(db) {
  ensureLocalDatabase();

  const normalized = normalizeDatabase(db);
  const tempPath = DB_PATH + "." + process.pid + ".tmp";

  fs.writeFileSync(
    tempPath,
    JSON.stringify(normalized, null, 2)
  );

  fs.renameSync(tempPath, DB_PATH);
  return normalized;
}

function writeDatabase(db) {
  const normalized = normalizeDatabase(db);

  if (IS_VERCEL_RUNTIME) {
    // Keep compatibility with the old API: Vercel can mutate this invocation's
    // memory, but persistent refreshes must happen before deployment.
    memoryDatabase = normalized;
    return normalized;
  }

  return writeLocalDatabase(normalized);
}

let mutationQueue = Promise.resolve();

function updateDatabase(mutator) {
  const operation = mutationQueue.then(() => {
    const db = readDatabase();
    const result = mutator(db);

    if (result && typeof result.then === "function") {
      return result.then(() => {
        db.updatedAt = new Date().toISOString();
        return writeDatabase(db);
      });
    }

    db.updatedAt = new Date().toISOString();
    return writeDatabase(db);
  });

  mutationQueue = Promise.resolve(operation).catch(() => {});
  return operation;
}

module.exports = {
  DB_PATH,
  EMPTY_DATABASE,
  readDatabase,
  writeDatabase,
  updateDatabase
};
