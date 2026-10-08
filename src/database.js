const fs = require("fs/promises");
const path = require("path");
const { put, get } = require("@vercel/blob");

const DB_PATH = path.join(__dirname, "..", "data", "anime-db.json");
const BLOB_PATH = "anime-api-21/anime-db.json";

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

function useVercelBlob() {
  return Boolean(process.env.VERCEL);
}

async function ensureDatabase() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(EMPTY_DATABASE, null, 2));
  }
}

async function readLocalDatabase() {
  await ensureDatabase();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return normalizeDatabase(JSON.parse(raw));
}

async function readBlobDatabase() {
  try {
    const result = await get(BLOB_PATH, {
      access: "private",
      useCache: false
    });

    if (!result) {
      return normalizeDatabase(EMPTY_DATABASE);
    }

    const raw = await new Response(result.stream).text();
    return normalizeDatabase(JSON.parse(raw));
  } catch (error) {
    if (error?.statusCode === 404 || error?.code === "BLOB_NOT_FOUND") {
      await writeBlobDatabase(EMPTY_DATABASE);
      return normalizeDatabase(EMPTY_DATABASE);
    }
    throw error;
  }
}

async function readDatabase() {
  if (useVercelBlob()) {
    return readBlobDatabase();
  }

  return readLocalDatabase();
}

async function writeLocalDatabase(db) {
  await ensureDatabase();
  const tempPath = DB_PATH + "." + process.pid + ".tmp";
  await fs.writeFile(tempPath, JSON.stringify(normalizeDatabase(db), null, 2));
  await fs.rename(tempPath, DB_PATH);
  return normalizeDatabase(db);
}

async function writeBlobDatabase(db) {
  await put(BLOB_PATH, JSON.stringify(normalizeDatabase(db), null, 2), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json"
  });

  return normalizeDatabase(db);
}

let mutationQueue = Promise.resolve();

function updateDatabase(mutator) {
  const operation = mutationQueue.then(async () => {
    const db = await readDatabase();
    await mutator(db);
    db.updatedAt = new Date().toISOString();

    if (useVercelBlob()) {
      return writeBlobDatabase(db);
    }

    return writeLocalDatabase(db);
  });

  mutationQueue = operation.catch(() => {});
  return operation;
}

async function writeDatabase(db) {
  return updateDatabase(async (current) => {
    Object.assign(current, normalizeDatabase(db));
  });
}

module.exports = {
  DB_PATH,
  BLOB_PATH,
  EMPTY_DATABASE,
  readDatabase,
  writeDatabase,
  updateDatabase
};
