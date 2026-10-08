const fs = require("fs/promises");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "anime-db.json");

async function ensureDatabase() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(
      DB_PATH,
      JSON.stringify({ version: 1, updatedAt: null, anime: [], episodes: [], movies: [] }, null, 2)
    );
  }
}

async function readDatabase() {
  await ensureDatabase();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

let writeQueue = Promise.resolve();

function writeDatabase(db) {
  writeQueue = writeQueue.then(async () => {
    db.updatedAt = new Date().toISOString();
    const tempPath = DB_PATH + ".tmp";
    await fs.writeFile(tempPath, JSON.stringify(db, null, 2));
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

module.exports = { DB_PATH, readDatabase, writeDatabase, updateDatabase };
