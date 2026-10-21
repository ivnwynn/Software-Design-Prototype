const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, "eggtrack.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS stock (
    id TEXT PRIMARY KEY,
    qty INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    qty INTEGER NOT NULL,
    price_per_egg REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_stock_created_at
    ON stock(created_at);

  CREATE INDEX IF NOT EXISTS idx_sales_created_at
    ON sales(created_at);
`);

function isValidIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function normalizeDate(value, fallback) {
  if (!isValidIsoDate(value)) return fallback;
  return new Date(value).toISOString();
}

module.exports = {
  db,
  normalizeDate
};